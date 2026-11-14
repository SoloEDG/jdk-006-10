import { useEffect, useState } from "react";
import { Radio, X } from "lucide-react";
import { CaseView } from "./CaseView";
import { useCaseLibrary } from "./useCaseLibrary";
import {
  BUILTIN_CASE_KEY,
  BundleRejection,
  CaseShelfDialog,
  ImportCaseDialog,
  PendingBundle,
  slotsKeyFor,
  unpackCaseBundle,
} from "../features/cases";
import { CASE_CONTENT } from "../features/story";

export function App() {
  const library = useCaseLibrary();
  const [shelf, setShelf] = useState(false);
  const [pending, setPending] = useState<PendingBundle | null>(null);
  const [issues, setIssues] = useState<string[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (library.ready && library.warning) setWarning(library.warning);
  }, [library.ready, library.warning]);

  useEffect(
    () => () => {
      pending?.dispose();
    },
    [pending],
  );

  if (!library.ready || !library.current)
    return (
      <div className="boot-screen">
        <Radio size={26} />
        <p>正在调谐午夜频率…</p>
      </div>
    );

  const pickFile = async (file: File) => {
    setChecking(true);
    setIssues(null);
    try {
      const unpacked = await unpackCaseBundle(await file.text());
      pending?.dispose();
      setPending(new PendingBundle(unpacked));
      setInstallError(null);
    } catch (error) {
      setIssues(
        error instanceof BundleRejection
          ? error.issues
          : [error instanceof Error ? error.message : "案件包无法读取。"],
      );
    } finally {
      setChecking(false);
    }
  };
  const cancelImport = () => {
    pending?.dispose();
    setPending(null);
    setInstallError(null);
  };
  const confirmImport = async () => {
    if (!pending) return;
    setInstalling(true);
    setInstallError(null);
    try {
      const key = await library.installPending(pending);
      await library.openCase(key);
      pending.dispose();
      setPending(null);
      setShelf(false);
    } catch (error) {
      setInstallError(
        error instanceof Error ? error.message : "案件包写入失败，请重试。",
      );
    } finally {
      setInstalling(false);
    }
  };
  const openCase = async (key: string) => {
    try {
      await library.openCase(key);
      setShelf(false);
      setIssues(null);
    } catch (error) {
      setIssues([
        error instanceof Error ? error.message : "案件包无法打开。",
      ]);
    }
  };

  return (
    <>
      {warning && (
        <div className="shell-warning" role="status">
          <span>{warning}</span>
          <button aria-label="关闭提示" onClick={() => setWarning(null)}>
            <X size={13} />
          </button>
        </div>
      )}
      <CaseView
        key={library.current.key}
        content={library.current.content}
        slotsKey={slotsKeyFor(library.current.key)}
        onOpenShelf={() => setShelf(true)}
      />
      {shelf && !pending && (
        <CaseShelfDialog
          currentKey={library.current.key}
          builtinTitle={CASE_CONTENT.title}
          builtinId={CASE_CONTENT.id}
          installed={library.installed}
          busy={checking}
          issues={issues}
          onOpen={(key) => void openCase(key)}
          onPickFile={(file) => void pickFile(file)}
          onClose={() => {
            setShelf(false);
            setIssues(null);
          }}
        />
      )}
      {pending && (
        <ImportCaseDialog
          pending={pending}
          busy={installing}
          error={installError}
          onConfirm={() => void confirmImport()}
          onCancel={cancelImport}
        />
      )}
    </>
  );
}
