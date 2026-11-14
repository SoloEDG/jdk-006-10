import type {
  CaseContent,
  Choice,
  Cue,
  Episode,
  Scene,
} from "../../../shared/types";
import { endingsOf, startSceneOf } from "../../story/model/investigation";
import { decodeBase64 } from "../lib/base64";
import { fingerprintText, sha256Hex, stableStringify } from "../lib/sha256";

export const BUNDLE_FORMAT = "midnight-frequency/case-bundle";
export const BUNDLE_VERSION = 1;

export interface BundleAudioEntry {
  sha256: string;
  data: string;
}
export interface CaseBundle {
  format: string;
  version: number;
  case: CaseContent;
  audio: Record<string, BundleAudioEntry>;
}
export interface BundleAudioInfo {
  name: string;
  size: number;
  sha256: string;
}
export interface BundleSummary {
  key: string;
  caseId: string;
  title: string;
  subtitle: string | null;
  summary: string;
  sceneCount: number;
  episodeCount: number;
  clueCount: number;
  audio: BundleAudioInfo[];
  totalSize: number;
  contentHash: string;
}
export interface UnpackedCase {
  summary: BundleSummary;
  content: CaseContent;
  audio: Map<string, Uint8Array>;
}
export class BundleRejection extends Error {
  issues: string[];
  constructor(issues: string[]) {
    super(issues[0] ?? "案件包无效");
    this.name = "BundleRejection";
    this.issues = issues;
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  !!v && typeof v === "object" && !Array.isArray(v);

const AUDIO_KEY = /^[A-Za-z0-9][\w./-]*$/;
export function audioKeyProblem(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return "声音路径必须是文字";
  const name = raw.trim();
  if (/^(https?:)?\/\//i.test(name) || /^[a-z][\w+.-]*:/i.test(name))
    return `声音「${name}」不允许引用远端地址`;
  if (name.startsWith("/") || name.startsWith("\\"))
    return `声音「${name}」不允许引用站点绝对路径`;
  if (!AUDIO_KEY.test(name) || name.split("/").some((p) => p === ".."))
    return `声音路径「${name}」不是合法的包内相对路径`;
  return null;
}

function readCue(value: unknown, label: string, issues: string[]): Cue | null {
  if (!isObj(value)) {
    issues.push(`${label}格式无效`);
    return null;
  }
  const bad = (msg: string) => issues.push(`${label}${msg}`);
  const id = typeof value.id === "string" && value.id.trim() ? value.id : null;
  if (!id) bad("缺少编号");
  const speaker =
    typeof value.speaker === "string" && value.speaker.trim()
      ? value.speaker
      : null;
  if (!speaker) bad("缺少说话人");
  const text = typeof value.text === "string" && value.text.trim() ? value.text : null;
  if (!text) bad("缺少字幕内容");
  const start = typeof value.start === "number" ? value.start : NaN;
  const end = typeof value.end === "number" ? value.end : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end)) bad("的时间码缺失");
  let sound: Cue["sound"];
  if (value.sound !== undefined) {
    if (!isObj(value.sound)) bad("的声音标记格式无效");
    else {
      const s = value.sound;
      const clueId = typeof s.clueId === "string" ? s.clueId : "";
      const ss = typeof s.start === "number" ? s.start : NaN;
      const se = typeof s.end === "number" ? s.end : NaN;
      const description =
        typeof s.description === "string" && s.description.trim()
          ? s.description
          : "未命名的声音";
      if (!clueId) bad("的声音标记缺少线索编号");
      else if (!Number.isFinite(ss) || !Number.isFinite(se))
        bad("的声音标记时间码缺失");
      else sound = { clueId, start: ss, end: se, description };
    }
  }
  if (!id || !speaker || !text || !Number.isFinite(start) || !Number.isFinite(end))
    return null;
  return { id, speaker, text, start, end, ...(sound ? { sound } : {}) };
}

function readChoice(value: unknown, label: string, issues: string[]): Choice | null {
  if (!isObj(value)) {
    issues.push(`${label}格式无效`);
    return null;
  }
  const id = typeof value.id === "string" && value.id.trim() ? value.id : "";
  const choiceLabel =
    typeof value.label === "string" && value.label.trim() ? value.label : "";
  const target = typeof value.target === "string" && value.target.trim() ? value.target : "";
  const description = typeof value.description === "string" ? value.description : "";
  const requires = Array.isArray(value.requires) ? value.requires : [];
  if (!id || !choiceLabel || !target) {
    issues.push(`${label}缺少编号、名称或目标场景`);
    return null;
  }
  if (requires.some((r) => typeof r !== "string" || !r)) {
    issues.push(`${label}的前置线索格式无效`);
    return null;
  }
  return {
    id,
    label: choiceLabel,
    target,
    description,
    requires: requires as string[],
  };
}

function readScene(value: unknown, issues: string[]): Scene | null {
  if (!isObj(value)) {
    issues.push("场景格式无效");
    return null;
  }
  const id = typeof value.id === "string" && value.id.trim() ? value.id : "";
  if (!id) {
    issues.push("场景缺少编号");
    return null;
  }
  const label = `场景「${id}」`;
  const title = typeof value.title === "string" && value.title.trim() ? value.title : "";
  if (!title) issues.push(`${label}缺少标题`);
  const choices = Array.isArray(value.choices) ? value.choices : [];
  if (!Array.isArray(value.choices)) issues.push(`${label}的分支必须是列表`);
  const parsed = choices
    .map((c, i) => readChoice(c, `${label}的第 ${i + 1} 个分支`, issues))
    .filter((c): c is Choice => !!c);
  const seen = new Set<string>();
  for (const c of parsed) {
    if (seen.has(c.id)) issues.push(`${label}的分支编号「${c.id}」重复`);
    seen.add(c.id);
  }
  return {
    id,
    title: title || id,
    location: typeof value.location === "string" ? value.location : "",
    chapter: typeof value.chapter === "string" ? value.chapter : "",
    description: typeof value.description === "string" ? value.description : "",
    choices: parsed,
  };
}

function readEpisode(value: unknown, issues: string[]): Episode | null {
  if (!isObj(value)) {
    issues.push("录音格式无效");
    return null;
  }
  const id = typeof value.id === "string" && value.id.trim() ? value.id : "";
  if (!id) {
    issues.push("录音缺少编号");
    return null;
  }
  const label = `录音「${id}」`;
  const sceneId = typeof value.sceneId === "string" ? value.sceneId : "";
  if (!sceneId) issues.push(`${label}缺少所属场景`);
  const duration = typeof value.duration === "number" ? value.duration : NaN;
  if (!Number.isFinite(duration) || duration <= 0)
    issues.push(`${label}的时长无效`);
  const audioProblem = audioKeyProblem(value.audio);
  if (audioProblem) issues.push(`${label}：${audioProblem}`);
  const wave = Array.isArray(value.wave) ? value.wave : [];
  if (
    wave.some(
      (v) => typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1,
    )
  )
    issues.push(`${label}的波形数据超出 0—1 范围`);
  const cues = Array.isArray(value.cues) ? value.cues : [];
  if (!Array.isArray(value.cues)) issues.push(`${label}的字幕必须是列表`);
  const parsedCues = cues
    .map((c, i) => readCue(c, `${label}的第 ${i + 1} 条字幕`, issues))
    .filter((c): c is Cue => !!c);
  const requires = Array.isArray(value.requires) ? value.requires : [];
  if (requires.some((r) => typeof r !== "string" || !r))
    issues.push(`${label}的触发线索格式无效`);
  return {
    id,
    sceneId,
    title: typeof value.title === "string" && value.title.trim() ? value.title : id,
    version: typeof value.version === "string" ? value.version : "",
    description: typeof value.description === "string" ? value.description : "",
    audio: typeof value.audio === "string" ? value.audio.trim() : "",
    duration: Number.isFinite(duration) ? duration : 0,
    cues: parsedCues,
    wave: wave.filter(
      (v): v is number => typeof v === "number" && Number.isFinite(v),
    ),
    ...(requires.length ? { requires: requires as string[] } : {}),
  };
}

export function parseBundleFile(text: string): CaseBundle {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BundleRejection(["文件不是有效的 JSON，无法作为案件包打开。"]);
  }
  const issues: string[] = [];
  if (!isObj(raw)) throw new BundleRejection(["案件包格式无效。"]);
  if (raw.format !== BUNDLE_FORMAT)
    issues.push("文件不是午夜频率案件包（format 标识不符）。");
  if (raw.version !== BUNDLE_VERSION)
    issues.push(`案件包版本不受支持（需要 ${BUNDLE_VERSION}）。`);
  if (!isObj(raw.case)) issues.push("案件包缺少案件内容。");
  if (!isObj(raw.audio)) issues.push("案件包缺少声音资源表。");
  if (issues.length) throw new BundleRejection(issues);
  const root = raw as { case: Obj; audio: Obj };
  const rawCase = root.case;

  const caseId =
    typeof rawCase.id === "string" && rawCase.id.trim() ? rawCase.id.trim() : "";
  if (!caseId) issues.push("案件缺少标识（id）。");
  const title =
    typeof rawCase.title === "string" && rawCase.title.trim()
      ? rawCase.title.trim()
      : "";
  if (!title) issues.push("案件缺少标题。");

  const scenes = (Array.isArray(rawCase.scenes) ? rawCase.scenes : [])
    .map((s) => readScene(s, issues))
    .filter((s): s is Scene => !!s);
  if (!Array.isArray(rawCase.scenes) || !rawCase.scenes.length)
    issues.push("案件包必须包含至少一个场景。");
  const sceneIds = new Set<string>();
  for (const s of scenes) {
    if (sceneIds.has(s.id)) issues.push(`场景编号「${s.id}」重复。`);
    sceneIds.add(s.id);
  }

  const episodes = (Array.isArray(rawCase.episodes) ? rawCase.episodes : [])
    .map((e) => readEpisode(e, issues))
    .filter((e): e is Episode => !!e);
  if (!Array.isArray(rawCase.episodes) || !rawCase.episodes.length)
    issues.push("案件包必须包含至少一段录音。");
  const episodeIds = new Set<string>();
  for (const e of episodes) {
    if (episodeIds.has(e.id)) issues.push(`录音编号「${e.id}」重复。`);
    episodeIds.add(e.id);
  }

  const clues = (Array.isArray(rawCase.clues) ? rawCase.clues : [])
    .map((c, i) => {
      if (!isObj(c) || typeof c.id !== "string" || !c.id.trim()) {
        issues.push(`第 ${i + 1} 条线索定义无效。`);
        return null;
      }
      return {
        id: c.id,
        title:
          typeof c.title === "string" && c.title.trim() ? c.title : c.id,
        kind: typeof c.kind === "string" ? c.kind : "声音线索",
        description: typeof c.description === "string" ? c.description : "",
      };
    })
    .filter((c): c is CaseContent["clues"][number] => !!c);
  const clueIds = new Set(clues.map((c) => c.id));
  if (clueIds.size !== clues.length) issues.push("线索编号重复。");

  const start =
    typeof rawCase.start === "string" && rawCase.start.trim()
      ? rawCase.start.trim()
      : undefined;
  const endings = Array.isArray(rawCase.endings)
    ? rawCase.endings.filter((e): e is string => typeof e === "string" && !!e)
    : undefined;

  const audio: Record<string, BundleAudioEntry> = {};
  for (const [name, entry] of Object.entries(root.audio)) {
    const problem = audioKeyProblem(name);
    if (problem) {
      issues.push(`声音资源表：${problem}`);
      continue;
    }
    if (!isObj(entry) || typeof entry.sha256 !== "string" || typeof entry.data !== "string") {
      issues.push(`声音「${name}」缺少内容指纹或数据。`);
      continue;
    }
    if (!/^[0-9a-f]{64}$/i.test(entry.sha256)) {
      issues.push(`声音「${name}」的内容指纹必须是 64 位十六进制。`);
      continue;
    }
    audio[name] = { sha256: entry.sha256.toLowerCase(), data: entry.data };
  }

  if (issues.length) throw new BundleRejection(issues);
  const content: CaseContent = {
    id: caseId,
    title,
    ...(typeof rawCase.subtitle === "string" && rawCase.subtitle.trim()
      ? { subtitle: rawCase.subtitle.trim() }
      : {}),
    ...(typeof rawCase.summary === "string" && rawCase.summary.trim()
      ? { summary: rawCase.summary.trim() }
      : {}),
    ...(start ? { start } : {}),
    ...(endings?.length ? { endings } : {}),
    scenes,
    episodes,
    clues,
  };
  return {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    case: content,
    audio,
  };
}

export function inspectBundle(bundle: CaseBundle): string[] {
  const issues: string[] = [];
  const content = bundle.case;
  const sceneIds = new Set(content.scenes.map((s) => s.id));
  const clueIds = new Set(content.clues.map((c) => c.id));
  const collectable = new Set(
    content.episodes.flatMap((e) =>
      e.cues.flatMap((c) => (c.sound ? [c.sound.clueId] : [])),
    ),
  );

  const start = startSceneOf(content);
  if (!sceneIds.has(start)) issues.push(`起始场景「${start}」不存在。`);
  const endings = endingsOf(content);
  if (!endings.length)
    issues.push("案件没有任何结局场景，调查无法完成。");
  for (const id of endings)
    if (!sceneIds.has(id)) issues.push(`结局场景「${id}」不存在。`);

  for (const scene of content.scenes) {
    for (const choice of scene.choices) {
      if (!sceneIds.has(choice.target))
        issues.push(
          `场景「${scene.id}」的分支「${choice.label}」指向不存在的场景「${choice.target}」。`,
        );
      for (const req of choice.requires) {
        if (!clueIds.has(req))
          issues.push(
            `场景「${scene.id}」的分支「${choice.label}」需要未定义的线索「${req}」。`,
          );
        else if (!collectable.has(req))
          issues.push(
            `场景「${scene.id}」的分支「${choice.label}」需要的线索「${req}」无法在任何录音中收集。`,
          );
      }
    }
  }

  const graph = new Map(content.scenes.map((s) => [s.id, s.choices.map((c) => c.target)]));
  const reachable = new Set<string>();
  if (sceneIds.has(start)) {
    const queue = [start];
    while (queue.length) {
      const id = queue.shift()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      for (const next of graph.get(id) ?? []) if (sceneIds.has(next)) queue.push(next);
    }
  }
  for (const scene of content.scenes)
    if (!reachable.has(scene.id))
      issues.push(`场景「${scene.id}」从起点出发永远无法到达。`);
  const endSet = new Set(endings.filter((e) => sceneIds.has(e)));
  if (endSet.size) {
    const canEnd = new Set(endSet);
    let grew = true;
    while (grew) {
      grew = false;
      for (const [id, targets] of graph)
        if (!canEnd.has(id) && targets.some((t) => canEnd.has(t))) {
          canEnd.add(id);
          grew = true;
        }
    }
    for (const id of reachable)
      if (!canEnd.has(id))
        issues.push(`场景「${id}」陷入循环死路，无法到达任何结局。`);
  }

  for (const episode of content.episodes) {
    const label = `录音「${episode.id}」`;
    if (!sceneIds.has(episode.sceneId)) {
      issues.push(`${label}属于不存在的场景「${episode.sceneId}」。`);
      continue;
    }
    if (!bundle.audio[episode.audio])
      issues.push(`${label}缺少对应的声音文件「${episode.audio}」。`);
    const cueIds = new Set<string>();
    for (const cue of episode.cues) {
      if (cueIds.has(cue.id)) issues.push(`${label}的字幕编号「${cue.id}」重复。`);
      cueIds.add(cue.id);
      if (cue.start < 0 || cue.end < cue.start || cue.end > episode.duration + 0.05)
        issues.push(
          `${label}的字幕「${cue.id}」越界（${cue.start.toFixed(2)}—${cue.end.toFixed(2)}，时长 ${episode.duration.toFixed(2)}）。`,
        );
      if (cue.sound) {
        if (!clueIds.has(cue.sound.clueId))
          issues.push(
            `${label}的声音标记引用了未定义的线索「${cue.sound.clueId}」。`,
          );
        if (
          cue.sound.start < 0 ||
          cue.sound.end < cue.sound.start ||
          cue.sound.end > episode.duration + 0.05
        )
          issues.push(`${label}的声音标记「${cue.sound.description}」越界。`);
      }
    }
    for (const req of episode.requires ?? [])
      if (!clueIds.has(req))
        issues.push(`${label}的触发条件引用了未定义的线索「${req}」。`);
  }
  for (const scene of content.scenes) {
    const here = content.episodes.filter((e) => e.sceneId === scene.id);
    if (!here.length) {
      issues.push(`场景「${scene.id}」没有任何录音。`);
      continue;
    }
    if (!here.some((e) => !(e.requires ?? []).length))
      issues.push(`场景「${scene.id}」没有默认录音，进入后将无声可播。`);
  }
  return issues;
}

export async function verifyBundleAudio(
  bundle: CaseBundle,
): Promise<Map<string, Uint8Array>> {
  const needed = new Set(bundle.case.episodes.map((e) => e.audio));
  const decoded = new Map<string, Uint8Array>();
  const issues: string[] = [];
  for (const name of needed) {
    const entry = bundle.audio[name];
    if (!entry) continue;
    let bytes: Uint8Array;
    try {
      bytes = decodeBase64(entry.data, `声音「${name}」`);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : `声音「${name}」无法解码。`);
      continue;
    }
    if (!bytes.length) {
      issues.push(`声音「${name}」是空文件。`);
      continue;
    }
    const digest = await sha256Hex(bytes);
    if (digest !== entry.sha256.toLowerCase()) {
      issues.push(`声音「${name}」的内容指纹与包内声明不符。`);
      continue;
    }
    decoded.set(name, bytes);
  }
  if (issues.length) throw new BundleRejection(issues);
  return decoded;
}

export async function summarizeBundle(
  bundle: CaseBundle,
  audio: Map<string, Uint8Array>,
): Promise<BundleSummary> {
  const audioHashes: Record<string, string> = {};
  const info: BundleAudioInfo[] = [];
  let totalSize = 0;
  for (const [name, bytes] of [...audio.entries()].sort()) {
    const sha256 = bundle.audio[name].sha256.toLowerCase();
    audioHashes[name] = sha256;
    info.push({ name, size: bytes.length, sha256 });
    totalSize += bytes.length;
  }
  const contentHash = await fingerprintText(
    stableStringify({ case: bundle.case, audio: audioHashes }),
  );
  return {
    key: `${bundle.case.id}@${contentHash.slice(0, 12)}`,
    caseId: bundle.case.id,
    title: bundle.case.title,
    subtitle: bundle.case.subtitle ?? null,
    summary: bundle.case.summary ?? "",
    sceneCount: bundle.case.scenes.length,
    episodeCount: bundle.case.episodes.length,
    clueCount: bundle.case.clues.length,
    audio: info,
    totalSize,
    contentHash,
  };
}

export async function unpackCaseBundle(text: string): Promise<UnpackedCase> {
  const bundle = parseBundleFile(text);
  const issues = inspectBundle(bundle);
  if (issues.length) throw new BundleRejection(issues);
  const audio = await verifyBundleAudio(bundle);
  const summary = await summarizeBundle(bundle, audio);
  return { summary, content: bundle.case, audio };
}
