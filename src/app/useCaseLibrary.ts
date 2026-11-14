import { useCallback, useEffect, useRef, useState } from "react";
import type { CaseContent } from "../shared/types";
import { CASE_CONTENT } from "../features/story";
import {
  BUILTIN_CASE_KEY,
  materializeCase,
  readCurrentCaseKey,
  releaseCase,
  writeCurrentCaseKey,
} from "../features/cases/model/library";
import type { InstalledCaseRecord } from "../features/cases/model/pending";
import { PendingBundle } from "../features/cases/model/pending";
import {
  createIdbBackend,
  createMemoryBackend,
  installCase,
  type CaseStoreBackend,
} from "../features/cases/lib/store";

export interface OpenCase {
  key: string;
  content: CaseContent;
  urls: string[];
  builtin: boolean;
}

export function useCaseLibrary() {
  const [ready, setReady] = useState(false);
  const [current, setCurrent] = useState<OpenCase | null>(null);
  const [installed, setInstalled] = useState<InstalledCaseRecord[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const backendRef = useRef<CaseStoreBackend | null>(null);
  const currentRef = useRef<OpenCase | null>(null);
  const installedRef = useRef<InstalledCaseRecord[]>([]);
  currentRef.current = current;
  const syncInstalled = (records: InstalledCaseRecord[]) => {
    installedRef.current = records;
    setInstalled(records);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let backend: CaseStoreBackend;
      let bootWarning: string | null = null;
      try {
        backend = createIdbBackend();
        await backend.list();
      } catch {
        backend = createMemoryBackend();
        bootWarning = "无法访问本地案件数据库，导入的案件包仅在本次会话中保留。";
      }
      backendRef.current = backend;
      const records = await backend.list().catch(() => []);
      const key = readCurrentCaseKey();
      let opened: OpenCase = {
        key: BUILTIN_CASE_KEY,
        content: CASE_CONTENT,
        urls: [],
        builtin: true,
      };
      if (key !== BUILTIN_CASE_KEY) {
        const record = records.find((item) => item.key === key);
        if (record) {
          try {
            const audio = await backend.loadAudio(key);
            const { content, urls } = materializeCase(record, audio);
            opened = { key, content, urls, builtin: false };
          } catch {
            bootWarning = "上次打开的案件包已不可用，已回到雾港来电。";
            writeCurrentCaseKey(BUILTIN_CASE_KEY);
          }
        } else {
          writeCurrentCaseKey(BUILTIN_CASE_KEY);
        }
      }
      if (cancelled) {
        releaseCase(opened.urls);
        return;
      }
      syncInstalled(records);
      setCurrent(opened);
      setWarning(bootWarning);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      if (currentRef.current) releaseCase(currentRef.current.urls);
    },
    [],
  );

  const openCase = useCallback(async (key: string) => {
    const previous = currentRef.current;
    if (!previous || previous.key === key) return;
    if (key === BUILTIN_CASE_KEY) {
      setCurrent({ key, content: CASE_CONTENT, urls: [], builtin: true });
      releaseCase(previous.urls);
      writeCurrentCaseKey(key);
      return;
    }
    const backend = backendRef.current;
    if (!backend) throw new Error("案件数据库不可用，请刷新后重试。");
    const record = installedRef.current.find((item) => item.key === key);
    if (!record) throw new Error("案件包不存在或已被移除。");
    const audio = await backend.loadAudio(key);
    const { content, urls } = materializeCase(record, audio);
    setCurrent({ key, content, urls, builtin: false });
    releaseCase(previous.urls);
    writeCurrentCaseKey(key);
  }, []);

  const installPending = useCallback(
    async (pending: PendingBundle): Promise<string> => {
      const backend = backendRef.current;
      if (!backend) throw new Error("案件数据库不可用，请刷新后重试。");
      await installCase(backend, pending.record, pending.audioBlobs());
      syncInstalled([
        ...installedRef.current.filter(
          (item) => item.key !== pending.record.key,
        ),
        pending.record,
      ]);
      return pending.record.key;
    },
    [],
  );

  return { ready, current, installed, warning, openCase, installPending };
}
