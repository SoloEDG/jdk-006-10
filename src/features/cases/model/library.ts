import type { CaseContent } from "../../../shared/types";
import type { InstalledCaseRecord } from "../model/pending";
import type { CaseAudioBlob } from "../lib/store";

export const BUILTIN_CASE_KEY = "builtin:fog-harbor-1998";
const CURRENT_KEY = "midnight-frequency:current-case:v1";
const SLOTS_PREFIX = "midnight-frequency:profiles:v1";

export function slotsKeyFor(caseKey: string): string {
  return caseKey === BUILTIN_CASE_KEY
    ? SLOTS_PREFIX
    : `${SLOTS_PREFIX}:${caseKey}`;
}

export function readCurrentCaseKey(): string {
  try {
    return localStorage.getItem(CURRENT_KEY) ?? BUILTIN_CASE_KEY;
  } catch {
    return BUILTIN_CASE_KEY;
  }
}

export function writeCurrentCaseKey(caseKey: string): void {
  try {
    localStorage.setItem(CURRENT_KEY, caseKey);
  } catch {
    /* 无法记住当前案件时，仅本次会话生效 */
  }
}

export interface MaterializedCase {
  content: CaseContent;
  urls: string[];
}

export function materializeCase(
  record: InstalledCaseRecord,
  audio: CaseAudioBlob[],
): MaterializedCase {
  const byName = new Map(audio.map((item) => [item.name, item.blob]));
  const urlByName = new Map<string, string>();
  const urls: string[] = [];
  const content: CaseContent = {
    ...record.content,
    scenes: record.content.scenes,
    clues: record.content.clues,
    episodes: record.content.episodes.map((episode) => {
      const blob = byName.get(episode.audio);
      if (!blob) return episode;
      let url = urlByName.get(episode.audio);
      if (!url) {
        url = URL.createObjectURL(blob);
        urlByName.set(episode.audio, url);
        urls.push(url);
      }
      return { ...episode, audio: url };
    }),
  };
  return { content, urls };
}

export function releaseCase(urls: string[]): void {
  for (const url of urls) URL.revokeObjectURL(url);
}

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
