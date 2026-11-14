import test from "node:test";
import assert from "node:assert/strict";
import {
  BUILTIN_CASE_KEY,
  BundleRejection,
  PendingBundle,
  audioKeyProblem,
  createMemoryBackend,
  encodeBase64,
  installCase,
  materializeCase,
  releaseCase,
  sha256Hex,
  slotsKeyFor,
  unpackCaseBundle,
} from "../src/features/cases/index";
import { CASE_CONTENT, createInvestigation } from "../src/features/story";
import { createEvidence } from "../src/features/evidence/index";
import {
  createSlot,
  createSnapshot,
  readSlots,
  writeSlot,
} from "../src/features/profiles/index";
import type { CaseContent } from "../src/shared/types";

const objectUrls = { created: [] as string[], revoked: [] as string[] };
(URL as any).createObjectURL = () => {
  const url = `blob:mock-${objectUrls.created.length}`;
  objectUrls.created.push(url);
  return url;
};
(URL as any).revokeObjectURL = (url: string) => {
  objectUrls.revoked.push(url);
};

const AUDIO_BYTES = new Uint8Array(
  Array.from({ length: 64 }, (_, i) => (i * 37 + 11) % 256),
);

function episodeFor(sceneId: string, id = `${sceneId}-main`) {
  return {
    id,
    sceneId,
    title: `${sceneId} 录音`,
    version: "原始录音",
    description: "",
    audio: "audio/shared.wav",
    duration: 10,
    wave: [0.2, 0.6, 0.3],
    cues: [
      {
        id: "cue-1",
        speaker: "旁白",
        text: "一段对白。",
        start: 0,
        end: 5,
        sound: { clueId: "whistle", start: 1, end: 2, description: "口哨声" },
      },
      { id: "cue-2", speaker: "旁白", text: "另一段对白。", start: 5, end: 9.5 },
    ],
  };
}
function validBundleBody() {
  return {
    format: "midnight-frequency/case-bundle",
    version: 1,
    case: {
      id: "friend-case",
      title: "朋友的案件",
      summary: "一桩发生在山城的旧案。",
      scenes: [
        {
          id: "dock",
          title: "渡口",
          location: "山城",
          chapter: "01",
          description: "",
          choices: [
            {
              id: "to-end",
              label: "前往终点",
              target: "end",
              requires: ["whistle"],
              description: "",
            },
          ],
        },
        {
          id: "end",
          title: "终点",
          location: "山城",
          chapter: "02",
          description: "",
          choices: [],
        },
      ],
      episodes: [episodeFor("dock"), episodeFor("end")],
      clues: [
        { id: "whistle", title: "口哨声", kind: "环境声音", description: "" },
      ],
    },
    audio: {} as Record<string, { sha256: string; data: string }>,
  };
}
async function makeBundle(
  mutate?: (bundle: ReturnType<typeof validBundleBody>) => void,
): Promise<string> {
  const bundle = validBundleBody();
  bundle.audio["audio/shared.wav"] = {
    sha256: await sha256Hex(AUDIO_BYTES),
    data: encodeBase64(AUDIO_BYTES),
  };
  mutate?.(bundle);
  return JSON.stringify(bundle);
}
async function unpack(mutate?: Parameters<typeof makeBundle>[0]) {
  return unpackCaseBundle(await makeBundle(mutate));
}

test("valid bundle unpacks with summary, sizes and content fingerprint key", async () => {
  const unpacked = await unpack();
  assert.equal(unpacked.summary.caseId, "friend-case");
  assert.equal(unpacked.summary.title, "朋友的案件");
  assert.match(unpacked.summary.key, /^friend-case@[0-9a-f]{12}$/);
  assert.equal(unpacked.summary.sceneCount, 2);
  assert.equal(unpacked.summary.episodeCount, 2);
  assert.equal(unpacked.summary.clueCount, 1);
  assert.equal(unpacked.summary.totalSize, AUDIO_BYTES.length);
  assert.deepEqual(
    unpacked.summary.audio.map((a) => a.size),
    [AUDIO_BYTES.length],
  );
  assert.equal(unpacked.audio.get("audio/shared.wav")?.length, 64);
});

test("same case id with different content coexists under different keys", async () => {
  const a = await unpack();
  const b = await unpack((bundle) => {
    bundle.case.title = "朋友的案件·修订版";
  });
  assert.equal(a.summary.caseId, b.summary.caseId);
  assert.notEqual(a.summary.key, b.summary.key);
  const again = await unpack();
  assert.equal(again.summary.key, a.summary.key);
  assert.notEqual(a.summary.key, BUILTIN_CASE_KEY);
  assert.notEqual(slotsKeyFor(a.summary.key), slotsKeyFor(BUILTIN_CASE_KEY));
  assert.notEqual(slotsKeyFor(a.summary.key), slotsKeyFor(b.summary.key));
});

test("remote or absolute audio references are rejected", async () => {
  assert.ok(audioKeyProblem("https://cdn.example.com/x.wav"));
  assert.ok(audioKeyProblem("//cdn.example.com/x.wav"));
  assert.ok(audioKeyProblem("data:audio/wav;base64,AAAA"));
  assert.ok(audioKeyProblem("/audio/arrival-normal.wav"));
  assert.ok(audioKeyProblem("../escape.wav"));
  assert.equal(audioKeyProblem("audio/shared.wav"), null);
  for (const bad of [
    "https://cdn.example.com/x.wav",
    "//cdn.example.com/x.wav",
    "/audio/x.wav",
  ]) {
    await assert.rejects(
      unpack((bundle) => {
        bundle.case.episodes[0].audio = bad;
      }),
      (error: unknown) => {
        assert.ok(error instanceof BundleRejection);
        assert.ok(
          error.issues.some((i) => /远端地址|绝对路径/.test(i)),
          `应拒绝 ${bad}`,
        );
        return true;
      },
    );
  }
});

test("missing audio file rejects the whole bundle", async () => {
  await assert.rejects(
    unpack((bundle) => {
      bundle.case.episodes[0].audio = "audio/missing.wav";
    }),
    (error: unknown) => {
      assert.ok(error instanceof BundleRejection);
      assert.ok(error.issues.some((i) => i.includes("缺少对应的声音文件")));
      return true;
    },
  );
});

test("audio fingerprint mismatch rejects the whole bundle", async () => {
  await assert.rejects(
    unpack((bundle) => {
      bundle.audio["audio/shared.wav"] = {
        sha256: "0".repeat(64),
        data: encodeBase64(AUDIO_BYTES),
      };
    }),
    (error: unknown) => {
      assert.ok(error instanceof BundleRejection);
      assert.ok(error.issues.some((i) => i.includes("内容指纹")));
      return true;
    },
  );
  await assert.rejects(
    unpack((bundle) => {
      bundle.audio["audio/shared.wav"].data = encodeBase64(
        new Uint8Array([1, 2, 3]),
      );
    }),
    /内容指纹/,
  );
});

test("out-of-range cues and sound marks reject the bundle", async () => {
  await assert.rejects(
    unpack((bundle) => {
      bundle.case.episodes[0].cues[1].end = 10.5;
    }),
    /字幕「cue-2」越界/,
  );
  await assert.rejects(
    unpack((bundle) => {
      bundle.case.episodes[0].cues[0].sound!.start = -1;
    }),
    /越界/,
  );
  await assert.rejects(
    unpack((bundle) => {
      bundle.case.episodes[0].cues[0].start = 4;
      bundle.case.episodes[0].cues[0].end = 2;
    }),
    /越界/,
  );
});

test("circular dead ends and unreachable scenes reject the bundle", async () => {
  await assert.rejects(
    unpack((bundle) => {
      bundle.case.scenes[0].choices = [
        {
          id: "loop",
          label: "兜圈",
          target: "loop-b",
          requires: [],
          description: "",
        },
      ];
      bundle.case.scenes.push({
        id: "loop-b",
        title: "环 B",
        location: "",
        chapter: "03",
        description: "",
        choices: [
          {
            id: "back",
            label: "回去",
            target: "dock",
            requires: [],
            description: "",
          },
        ],
      });
      bundle.case.episodes.push(episodeFor("loop-b"));
    }),
    (error: unknown) => {
      assert.ok(error instanceof BundleRejection);
      assert.ok(error.issues.some((i) => i.includes("循环死路")));
      assert.ok(error.issues.some((i) => i.includes("永远无法到达")));
      return true;
    },
  );
});

test("broken branches, unknown or uncollectable required clues are rejected", async () => {
  await assert.rejects(
    unpack((bundle) => {
      bundle.case.scenes[0].choices[0].target = "nowhere";
    }),
    /不存在的场景/,
  );
  await assert.rejects(
    unpack((bundle) => {
      bundle.case.scenes[0].choices[0].requires = ["ghost"];
    }),
    /未定义的线索/,
  );
  await assert.rejects(
    unpack((bundle) => {
      bundle.case.clues.push({
        id: "photo",
        title: "照片",
        kind: "物品",
        description: "",
      });
      bundle.case.scenes[0].choices[0].requires = ["photo"];
    }),
    /无法在任何录音中收集/,
  );
  await assert.rejects(
    unpack((bundle) => {
      bundle.case.episodes = bundle.case.episodes.map((e) =>
        e.sceneId === "dock" ? { ...e, requires: ["whistle"] } : e,
      );
    }),
    /没有默认录音/,
  );
});

test("rejected bundles leave the store and current investigation untouched", async () => {
  const backend = createMemoryBackend();
  const good = new PendingBundle(await unpack());
  await installCase(backend, good.record, good.audioBlobs());
  await assert.rejects(
    unpack((bundle) => {
      bundle.case.episodes[0].audio = "audio/missing.wav";
    }),
  );
  const installed = await backend.list();
  assert.equal(installed.length, 1);
  assert.equal(installed[0].key, good.record.key);
  good.dispose();
});

test("cancelling after unpack releases every temporary sound", async () => {
  const before = objectUrls.created.length;
  const unpacked = await unpack();
  const pending = new PendingBundle(unpacked);
  assert.equal(objectUrls.created.length, before + 1);
  assert.ok(pending.audioUrl("audio/shared.wav"));
  pending.dispose();
  assert.equal(objectUrls.revoked.length, before + 1);
  assert.deepEqual(
    objectUrls.revoked.slice(before),
    objectUrls.created.slice(before),
  );
  assert.equal(pending.audioUrl("audio/shared.wav"), null);
  assert.equal(pending.audioBlob("audio/shared.wav"), null);
  pending.dispose();
  assert.equal(objectUrls.revoked.length, before + 1);
});

test("quota failure keeps previously usable cases intact", async () => {
  const backend = createMemoryBackend();
  const first = new PendingBundle(await unpack());
  await installCase(backend, first.record, first.audioBlobs());
  const second = new PendingBundle(
    await unpack((bundle) => {
      bundle.case.title = "另一桩案件";
    }),
  );
  backend.failNextInstall(new DOMException("full", "QuotaExceededError"));
  await assert.rejects(
    installCase(backend, second.record, second.audioBlobs()),
    /此前可用的案件均已保留/,
  );
  const installed = await backend.list();
  assert.equal(installed.length, 1);
  assert.equal(installed[0].key, first.record.key);
  assert.equal((await backend.loadAudio(first.record.key)).length, 1);
  assert.equal((await backend.loadAudio(second.record.key)).length, 0);
  first.dispose();
  second.dispose();
});

test("installed case reloads offline from the store with fresh object urls", async () => {
  const backend = createMemoryBackend();
  const pending = new PendingBundle(await unpack());
  await installCase(backend, pending.record, pending.audioBlobs());
  pending.dispose();
  const [record] = await backend.list();
  const audio = await backend.loadAudio(record.key);
  const before = objectUrls.created.length;
  const { content, urls } = materializeCase(record, audio);
  assert.equal(urls.length, 1);
  assert.equal(content.episodes[0].audio, urls[0]);
  assert.match(content.episodes[0].audio, /^blob:mock-/);
  assert.equal(content.id, "friend-case");
  assert.equal(content.scenes.length, 2);
  releaseCase(urls);
  assert.deepEqual(objectUrls.revoked.slice(before), urls);
});

test("each case keeps its own save namespace so clues never leak across cases", async () => {
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, val: string) => memory.set(key, val),
    },
  });
  const unpacked = await unpack();
  const content: CaseContent = unpacked.content;
  const friendSnapshot = createSnapshot(
    content,
    createInvestigation(content),
    { ...createEvidence(), clues: ["whistle"] },
    {},
    { sceneId: "dock", position: 0, rate: 1 },
  );
  const fogSnapshot = createSnapshot(
    CASE_CONTENT,
    createInvestigation(CASE_CONTENT),
    { ...createEvidence(), clues: ["bell"] },
    {},
    { sceneId: "arrival", position: 0, rate: 1 },
  );
  const friendKey = slotsKeyFor(unpacked.summary.key);
  writeSlot([], createSlot("朋友的路线", friendSnapshot), friendKey);
  writeSlot([], createSlot("雾港路线", fogSnapshot));
  const friendSlots = readSlots(content, friendKey).slots;
  const fogSlots = readSlots(CASE_CONTENT).slots;
  assert.equal(friendSlots.length, 1);
  assert.equal(fogSlots.length, 1);
  assert.deepEqual(friendSlots[0].snapshot.evidence.clues, ["whistle"]);
  assert.deepEqual(fogSlots[0].snapshot.evidence.clues, ["bell"]);
  const cross = readSlots(CASE_CONTENT, friendKey);
  assert.equal(cross.slots.length, 0);
  assert.ok(cross.warning);
});
