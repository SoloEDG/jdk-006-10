import { useRef } from "react";
import {
  Check,
  FolderOpen,
  Library,
  LoaderCircle,
  Package,
  Radio,
  Upload,
  X,
} from "lucide-react";
import type { InstalledCaseRecord } from "../model/pending";
import { BUILTIN_CASE_KEY, formatSize } from "../model/library";

export function CaseShelfDialog({
  currentKey,
  builtinTitle,
  builtinId,
  installed,
  busy,
  issues,
  onOpen,
  onPickFile,
  onClose,
}: {
  currentKey: string;
  builtinTitle: string;
  builtinId: string;
  installed: InstalledCaseRecord[];
  busy: boolean;
  issues: string[] | null;
  onOpen: (key: string) => void;
  onPickFile: (file: File) => void;
  onClose: () => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="profiles-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shelf-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="dialog-header">
          <div>
            <span className="eyebrow">CASE SHELF</span>
            <h2 id="shelf-title">
              <Library size={20} /> 案件库
            </h2>
          </div>
          <button className="icon-button" aria-label="关闭案件库" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <p className="panel-description">
          每桩案件都有独立的调查空间：线索、笔记与存档互不相通。
        </p>
        <div className="profile-list">
          <article
            className={`profile-card ${currentKey === BUILTIN_CASE_KEY ? "active" : ""}`}
          >
            <div>
              <h3>
                <Radio size={14} /> {builtinTitle}
                {currentKey === BUILTIN_CASE_KEY && (
                  <span className="active-label">当前案件</span>
                )}
              </h3>
              <p>内置案件 · {builtinId}</p>
            </div>
            <div className="profile-actions">
              <button
                disabled={currentKey === BUILTIN_CASE_KEY}
                onClick={() => onOpen(BUILTIN_CASE_KEY)}
              >
                <FolderOpen size={15} /> 打开
              </button>
            </div>
          </article>
          {installed.map((record) => (
            <article
              className={`profile-card ${currentKey === record.key ? "active" : ""}`}
              key={record.key}
            >
              <div>
                <h3>
                  <Package size={14} /> {record.title}
                  {currentKey === record.key && (
                    <span className="active-label">当前案件</span>
                  )}
                </h3>
                <p>
                  {record.caseId} · 指纹 {record.contentHash.slice(0, 10)} ·{" "}
                  {record.content.scenes.length} 个场景 ·{" "}
                  {record.content.episodes.length} 段录音 ·{" "}
                  {formatSize(record.totalSize)} ·{" "}
                  {new Date(record.importedAt).toLocaleString("zh-CN")} 导入
                </p>
              </div>
              <div className="profile-actions">
                <button
                  disabled={currentKey === record.key}
                  onClick={() => onOpen(record.key)}
                >
                  {currentKey === record.key ? (
                    <Check size={15} />
                  ) : (
                    <FolderOpen size={15} />
                  )}{" "}
                  打开
                </button>
              </div>
            </article>
          ))}
        </div>
        {issues && (
          <div className="issue-list" role="alert">
            <strong>案件包未通过检查，已整包拒绝，当前调查不受影响：</strong>
            <ul>
              {issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          </div>
        )}
        <footer className="dialog-footer">
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              const selected = event.target.files?.[0];
              if (selected) onPickFile(selected);
              event.target.value = "";
            }}
          />
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => file.current?.click()}
          >
            {busy ? (
              <>
                <LoaderCircle size={15} className="spin" /> 正在检查案件包…
              </>
            ) : (
              <>
                <Upload size={15} /> 导入案件包
              </>
            )}
          </button>
          <span>案件包为单个 JSON 文件，声音随包携带，检查通过后可离线收听</span>
        </footer>
      </section>
    </div>
  );
}
