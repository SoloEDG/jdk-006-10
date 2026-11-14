import { useEffect, useRef, useState } from "react";
import {
  FileAudio,
  Fingerprint,
  LoaderCircle,
  PackageCheck,
  Pause,
  Play,
  X,
} from "lucide-react";
import type { PendingBundle } from "../model/pending";
import { formatSize } from "../model/library";

export function ImportCaseDialog({
  pending,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  pending: PendingBundle;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [playing, setPlaying] = useState<string | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const { summary } = pending;
  useEffect(
    () => () => {
      player.current?.pause();
      player.current = null;
    },
    [],
  );
  const stop = () => {
    player.current?.pause();
    player.current = null;
    setPlaying(null);
  };
  const toggle = (name: string) => {
    if (playing === name) {
      stop();
      return;
    }
    const url = pending.audioUrl(name);
    if (!url) return;
    stop();
    const audio = new Audio(url);
    audio.addEventListener("ended", () => setPlaying(null));
    player.current = audio;
    setPlaying(name);
    void audio.play().catch(() => setPlaying(null));
  };
  const cancel = () => {
    stop();
    onCancel();
  };
  return (
    <div className="modal-backdrop" onClick={busy ? undefined : cancel}>
      <section
        className="profiles-dialog import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="dialog-header">
          <div>
            <span className="eyebrow">OFFLINE CASE BUNDLE</span>
            <h2 id="import-title">
              <PackageCheck size={20} /> 案件包检查通过
            </h2>
          </div>
          <button
            className="icon-button"
            aria-label="取消导入"
            onClick={cancel}
            disabled={busy}
          >
            <X size={20} />
          </button>
        </header>
        <div className="import-summary">
          <h3>
            {summary.title}
            {summary.subtitle && <small>{summary.subtitle}</small>}
          </h3>
          {summary.summary && <p>{summary.summary}</p>}
          <div className="import-meta">
            <span>
              案件标识 <b>{summary.caseId}</b>
            </span>
            <span>
              场景 <b>{summary.sceneCount}</b>
            </span>
            <span>
              录音 <b>{summary.episodeCount}</b> 段
            </span>
            <span>
              线索 <b>{summary.clueCount}</b> 条
            </span>
            <span>
              声音共 <b>{formatSize(summary.totalSize)}</b>
            </span>
          </div>
          <p className="import-hash">
            <Fingerprint size={12} /> 内容指纹 {summary.contentHash.slice(0, 16)}
            … 与既有案件互不影响
          </p>
        </div>
        <div className="import-audio-list">
          {summary.audio.map((item) => (
            <div className="import-audio-row" key={item.name}>
              <button
                className="icon-button"
                aria-label={`试听 ${item.name}`}
                onClick={() => toggle(item.name)}
                disabled={busy}
              >
                {playing === item.name ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <FileAudio size={14} />
              <span className="audio-name">{item.name}</span>
              <span className="audio-size">{formatSize(item.size)}</span>
              <code>{item.sha256.slice(0, 10)}</code>
            </div>
          ))}
        </div>
        <p className="panel-description">
          包内声音已按内容指纹逐一核对，全部随包携带，导入后可离线收听。
        </p>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <footer className="dialog-footer">
          <button className="secondary-button" onClick={cancel} disabled={busy}>
            取消
          </button>
          <button className="primary-button" onClick={onConfirm} disabled={busy}>
            {busy ? (
              <>
                <LoaderCircle size={15} className="spin" /> 正在写入…
              </>
            ) : (
              "导入并打开"
            )}
          </button>
          <span>取消导入不会留下任何临时声音</span>
        </footer>
      </section>
    </div>
  );
}
