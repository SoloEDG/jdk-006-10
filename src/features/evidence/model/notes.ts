import type { AudioBookmark, EvidenceState } from "../../../shared/types";
const BUILTIN_SCENES = ["arrival", "harbor", "interview", "tower", "finale"];
export function normalizeAnchor(
  anchor: AudioBookmark,
  sceneIds?: string[],
): AudioBookmark {
  const valid = sceneIds ?? BUILTIN_SCENES;
  if (
    !anchor ||
    typeof anchor.sceneId !== "string" ||
    !valid.includes(anchor.sceneId) ||
    !Number.isFinite(anchor.start) ||
    !Number.isFinite(anchor.end) ||
    anchor.start < 0 ||
    anchor.end < anchor.start
  )
    throw new Error("笔记的播放范围无效");
  return { sceneId: anchor.sceneId, start: anchor.start, end: anchor.end };
}
export function createEvidence(): EvidenceState {
  return { notes: [], clues: [], selectedId: null };
}
export function addNote(
  state: EvidenceState,
  bookmark: AudioBookmark,
  text: string,
  title = "收听笔记",
  sceneIds?: string[],
): EvidenceState {
  const anchor = normalizeAnchor(bookmark, sceneIds);
  const body = text.trim();
  if (!body) throw new Error("请填写笔记内容");
  const note = {
    id: crypto.randomUUID(),
    clueId: null,
    title: title.trim() || "收听笔记",
    text: body,
    anchor,
    createdAt: Date.now(),
    pinned: false,
  };
  return { ...state, notes: [note, ...state.notes], selectedId: note.id };
}
export function editNote(
  state: EvidenceState,
  id: string,
  text: string,
): EvidenceState {
  if (!text.trim()) throw new Error("笔记内容不能为空");
  return {
    ...state,
    notes: state.notes.map((note) =>
      note.id === id ? { ...note, text: text.trim() } : note,
    ),
  };
}
export function deleteNote(state: EvidenceState, id: string): EvidenceState {
  return {
    ...state,
    notes: state.notes.filter((note) => note.id !== id),
    selectedId: state.selectedId === id ? null : state.selectedId,
  };
}
export function togglePinned(state: EvidenceState, id: string): EvidenceState {
  return {
    ...state,
    notes: state.notes.map((note) =>
      note.id === id ? { ...note, pinned: !note.pinned } : note,
    ),
  };
}
export function selectNote(
  state: EvidenceState,
  id: string | null,
): EvidenceState {
  return {
    ...state,
    selectedId: id && state.notes.some((note) => note.id === id) ? id : null,
  };
}
