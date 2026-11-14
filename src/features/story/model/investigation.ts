import type {
  CaseContent,
  Investigation,
  SceneId,
} from "../../../shared/types";
export function startSceneOf(content: CaseContent): SceneId {
  return content.start ?? content.scenes[0]?.id ?? "arrival";
}
export function endingsOf(content: CaseContent): SceneId[] {
  if (content.endings?.length) return content.endings;
  const leaf = content.scenes
    .filter((scene) => scene.choices.length === 0)
    .map((scene) => scene.id);
  const finale = content.scenes.some((scene) => scene.id === "finale")
    ? ["finale"]
    : [];
  return [...new Set([...finale, ...leaf])];
}
export function createInvestigation(content?: CaseContent): Investigation {
  const start = content ? startSceneOf(content) : "arrival";
  return {
    sceneId: start,
    visited: [start],
    decisions: [],
    ending: null,
  };
}
export function enterScene(
  content: CaseContent,
  state: Investigation,
  sceneId: SceneId,
): Investigation {
  if (!content.scenes.some((s) => s.id === sceneId))
    throw new Error("调查地点不存在");
  return {
    ...state,
    sceneId,
    visited: state.visited.includes(sceneId)
      ? state.visited
      : [...state.visited, sceneId],
  };
}
export function applyChoice(
  content: CaseContent,
  state: Investigation,
  id: string,
  clues: string[],
): Investigation {
  const scene = content.scenes.find((s) => s.id === state.sceneId),
    choice = scene?.choices.find((c) => c.id === id);
  if (!choice) throw new Error("调查方向不存在");
  if (!choice.requires.every((c) => clues.includes(c)))
    throw new Error("声音证据不足，请先补充调查");
  const next = enterScene(content, state, choice.target);
  const ending = endingsOf(content).includes(choice.target)
    ? (content.scenes.find((s) => s.id === choice.target)?.title ??
      choice.target)
    : state.ending;
  return {
    ...next,
    decisions: [...state.decisions, { sceneId: state.sceneId, choiceId: id }],
    ending,
  };
}
