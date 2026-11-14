import type { CaseContent, Episode, SceneId } from "../../../shared/types";
export function resolveEpisode(
  content: CaseContent,
  sceneId: SceneId,
  clues: string[],
): Episode {
  const candidates = content.episodes.filter((e) => e.sceneId === sceneId);
  const unlocked = candidates
    .filter((e) => (e.requires ?? []).every((id) => clues.includes(id)))
    .sort((a, b) => (b.requires?.length ?? 0) - (a.requires?.length ?? 0));
  const episode =
    unlocked[0] ?? candidates.find((e) => !(e.requires ?? []).length);
  if (!episode) throw new Error("该段录音无法读取");
  return episode;
}
export function sceneProgress(content: CaseContent, visited: SceneId[]) {
  return Math.round(
    (new Set(visited.filter((id) => content.scenes.some((s) => s.id === id)))
      .size /
      content.scenes.length) *
      100,
  );
}
