import { useState } from "react";
import {
  Radio,
  FolderOpen,
  ArrowUpRight,
  NotebookPen,
  Headphones,
  Volume2,
  BookOpen,
  RotateCcw,
  Save,
  Check,
  ChevronRight,
  Info,
  Library,
} from "lucide-react";
import type { CaseContent } from "../shared/types";
import {
  Chapters,
  Directions,
  SceneArtwork,
  sceneProgress,
} from "../features/story";
import { Player } from "../features/listening";
import { TranscriptPanel } from "../features/transcript";
import { EvidencePanel, canCollectSound } from "../features/evidence";
import { ProfilesDialog } from "../features/profiles";
import { currentCue } from "../features/transcript";
import { useCase } from "./useCase";
export function CaseView({
  content,
  slotsKey,
  onOpenShelf,
}: {
  content: CaseContent;
  slotsKey: string;
  onOpenShelf: () => void;
}) {
  const c = useCase(content, slotsKey),
    [tab, setTab] = useState<"transcript" | "evidence">("transcript"),
    [profiles, setProfiles] = useState(false),
    [about, setAbout] = useState(false);
  const scene = content.scenes.find((s) => s.id === c.story.sceneId)!,
    cue = currentCue(c.episode, c.audio.view.position),
    activeSlot = c.slots.find((s) => s.id === c.activeId),
    episodeCount = String(content.scenes.length).padStart(2, "0");
  const showProfiles = () => {
    c.audio.pause();
    setProfiles(true);
  };
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#">
          <span className="brand-icon">
            <Radio size={23} />
          </span>
          <span>
            午夜频率<small>MIDNIGHT FREQUENCY</small>
          </span>
        </a>
        <nav>
          <span className="nav-selected">
            <Headphones size={14} />
            互动广播剧
          </span>
          <button onClick={() => setAbout(true)}>
            <BookOpen size={14} />
            收听指南
          </button>
        </nav>
        <button className="shelf-button" onClick={onOpenShelf}>
          <Library size={15} />
          案件库
        </button>
        <button className="archive-button" onClick={showProfiles}>
          <FolderOpen size={15} />
          调查存档<span>{c.slots.length}</span>
        </button>
        <div className="avatar">探</div>
      </header>
      <main>
        <div className="breadcrumbs">
          声音剧场 <ChevronRight size={11} /> 互动推理{" "}
          <ChevronRight size={11} />
          <span>{content.title}</span>
        </div>
        <div className="case-heading">
          <div>
            <div className="eyebrow">AN INTERACTIVE AUDIO MYSTERY</div>
            <h1>
              {content.title}
              {content.subtitle && <span>{content.subtitle}</span>}
            </h1>
            <p>{content.summary ?? "一段声音，一种可能。"}</p>
          </div>
          <div className="case-tags">
            <span>悬疑推理</span>
            <span>中文广播剧</span>
            <span className="headphone-tag">
              <Headphones size={12} />
              建议佩戴耳机
            </span>
          </div>
        </div>
        <div className="workspace">
          <aside className="left-column">
            <div className="case-file">
              <div className="file-stamp">CASE FILE / {content.id}</div>
              <div className="case-icon">
                <Radio size={34} />
              </div>
              <h3>{content.title}</h3>
              <p>{content.subtitle ?? content.id}</p>
              <span className="case-difficulty">
                悬疑 / {content.scenes.length} 段场景 · {content.clues.length}{" "}
                条线索
              </span>
            </div>
            <Chapters content={content} story={c.story} onEnter={c.go} />
            <div className="investigation-progress">
              <div>
                <span>探索进度</span>
                <b>{sceneProgress(content, c.story.visited)}%</b>
              </div>
              <div className="progress-track">
                <i
                  style={{
                    width: `${sceneProgress(content, c.story.visited)}%`,
                  }}
                />
              </div>
              <small>
                {c.story.visited.length} / {content.scenes.length} 个场景已到访
              </small>
            </div>
            <div className="left-note">
              <Info size={13} />
              <p>
                你掌握的每条线索，
                <br />
                都可能改变下一次对话。
              </p>
            </div>
          </aside>
          <div className="center-column">
            <section className="scene-card">
              <div className="scene-stage">
                <SceneArtwork sceneId={c.story.sceneId} />
                <div className="stage-top">
                  <span>
                    <span className="live-dot" />{" "}
                    {c.audio.view.playing ? "正在收听" : "调查进行中"}
                  </span>
                  <span>
                    EPISODE {scene.chapter} / {episodeCount}
                  </span>
                </div>
                <div className="stage-title">
                  <span className="scene-location">
                    {scene.location.toUpperCase()}
                  </span>
                  <h2>{c.episode.title}</h2>
                  <p>{scene.description}</p>
                </div>
                <div className="scene-grain" />
              </div>
              <div className="scene-meta">
                <div>
                  <span className="chapter-badge">CH. {scene.chapter}</span>
                  <strong>{c.episode.title}</strong>
                  <small>{c.episode.version}</small>
                </div>
                <button
                  onClick={() => {
                    c.audio.pause();
                    setTab("evidence");
                    c.note();
                  }}
                >
                  <NotebookPen size={14} />
                  记一笔
                </button>
              </div>
              <Player
                episode={c.episode}
                state={c.audio.view}
                onToggle={() => void c.audio.toggle()}
                onSeek={c.audio.seek}
                onRate={c.audio.setRate}
                onVolume={c.audio.setVolume}
                onNote={() => {
                  c.note();
                  setTab("evidence");
                }}
              />
              <div className="live-caption">
                <span>{cue?.speaker ?? content.title}</span>
                <p>
                  {c.audio.view.loading
                    ? "正在调谐下一段声音…"
                    : (cue?.text ?? "点击播放，让声音带你进入故事。")}
                </p>
                <Volume2 size={13} />
              </div>
            </section>
            <Directions
              content={content}
              story={c.story}
              clues={c.evidence.clues}
              onChoose={c.choose}
            />
            <div className="session-bar">
              <span>
                <span className={`live-dot ${c.dirty ? "unsaved" : ""}`} />
                {activeSlot
                  ? `${activeSlot.name}${c.dirty ? " · 有未保存更改" : " · 已保存"}`
                  : "未命名的调查路线"}
              </span>
              <button onClick={showProfiles}>
                <Save size={13} />
                保存进度
              </button>
              <button onClick={c.reset}>
                <RotateCcw size={12} />
                新调查
              </button>
            </div>
          </div>
          <aside className="right-column">
            <div className="panel-tabs">
              <button
                className={tab === "transcript" ? "active" : ""}
                onClick={() => setTab("transcript")}
              >
                <Headphones size={14} />
                剧情字幕
              </button>
              <button
                className={tab === "evidence" ? "active" : ""}
                onClick={() => setTab("evidence")}
              >
                <NotebookPen size={14} />
                线索笔记<span>{c.evidence.notes.length}</span>
              </button>
            </div>
            {tab === "transcript" ? (
              <TranscriptPanel
                episode={c.episode}
                position={c.audio.view.position}
                history={c.heard}
                clues={c.evidence.clues}
                onSeek={c.audio.seek}
                onCollect={(cue) => {
                  c.collect(cue);
                  setTab("evidence");
                }}
                canCollect={(cue) =>
                  !c.audio.view.loading &&
                  canCollectSound(c.heard, c.episode, cue)
                }
              />
            ) : (
              <EvidencePanel
                state={c.evidence}
                content={content}
                onJump={c.jump}
                onEdit={c.edit}
                onDelete={c.remove}
                onPin={c.pin}
                onNew={c.note}
              />
            )}
            <div className="clue-tracker">
              <div>
                <span className="mini-label">SOUND EVIDENCE</span>
                <b>
                  {c.evidence.clues.length}
                  <small> / {content.clues.length}</small>
                </b>
              </div>
              <div className="evidence-dots">
                {content.clues.map((clue) => (
                  <span
                    key={clue.id}
                    title={clue.title}
                    className={
                      c.evidence.clues.includes(clue.id) ? "found" : ""
                    }
                  >
                    {c.evidence.clues.includes(clue.id) ? (
                      <Check size={12} />
                    ) : (
                      <Headphones size={11} />
                    )}
                  </span>
                ))}
              </div>
              <p>留意对白之间，那些不经意的声音。</p>
            </div>
          </aside>
        </div>
        <div role="status" className="notice">
          <span className="live-dot" />
          {c.notice}
        </div>
        <footer>
          <span>
            <Radio size={13} /> MIDNIGHT FREQUENCY <i /> 戴上耳机，走进故事。
          </span>
          <span>
            一段声音，一种可能。 <span className="footer-id">JDK—006</span>
          </span>
        </footer>
      </main>
      {profiles && (
        <ProfilesDialog
          slots={c.slots}
          activeId={c.activeId}
          onLoad={(id) => {
            c.load(id);
            setProfiles(false);
          }}
          onSave={c.save}
          onDelete={c.removeSlot}
          onImport={c.importText}
          onExport={c.download}
          onClose={() => setProfiles(false)}
        />
      )}
      {about && (
        <div className="modal-backdrop">
          <section className="guide-dialog">
            <button className="dialog-close" onClick={() => setAbout(false)}>
              关闭 ✕
            </button>
            <div className="eyebrow">LISTEN. NOTICE. INVESTIGATE.</div>
            <h2>每一种声音，都有来处。</h2>
            <p>
              点击播放收听中文录音，右侧字幕随音频推进。点击时间码或拖动波形可以回听片段。
            </p>
            <p>
              当你听到可疑声音，收集字幕下方的声音线索。已掌握的线索会改变角色回答，并解锁新的调查方向。
            </p>
            <p>
              用「标记此刻」保留最近五秒的个人笔记，编辑观察，再从笔记跳回录音。自由笔记不会自动解锁证据。
            </p>
            <p>
              从「调查存档」命名保存不同进度，也可导出或导入本地文件。新调查保留已有存档；切换存档会替换当前未保存进度，请先保存。
            </p>
            <p>
              朋友制作的案件包，可以从「案件库」导入。案件包经过完整性检查后才会打开，不会影响当前调查。
            </p>
            <button className="primary" onClick={() => setAbout(false)}>
              开始倾听 <ArrowUpRight size={15} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
