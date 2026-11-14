import type { InstalledCaseRecord } from "../model/pending";

export interface CaseAudioBlob {
  name: string;
  blob: Blob;
}
export interface CaseStoreBackend {
  list(): Promise<InstalledCaseRecord[]>;
  loadAudio(caseKey: string): Promise<CaseAudioBlob[]>;
  install(record: InstalledCaseRecord, audio: CaseAudioBlob[]): Promise<void>;
}

export function isQuotaError(error: unknown): boolean {
  if (!error) return false;
  const name = (error as { name?: string }).name ?? "";
  const message = error instanceof Error ? error.message : String(error);
  return (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    /quota|空间不足|存储已满/i.test(message)
  );
}

export async function installCase(
  backend: CaseStoreBackend,
  record: InstalledCaseRecord,
  audio: CaseAudioBlob[],
): Promise<void> {
  try {
    await backend.install(record, audio);
  } catch (error) {
    if (isQuotaError(error))
      throw new Error(
        "存储空间不足，案件包未保存；此前可用的案件均已保留，可清理浏览器存储后重试。",
      );
    throw error instanceof Error ? error : new Error("案件包写入失败");
  }
}

const DB_NAME = "midnight-frequency-cases";
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("cases"))
        db.createObjectStore("cases", { keyPath: "key" });
      if (!db.objectStoreNames.contains("audio")) {
        const store = db.createObjectStore("audio", { keyPath: "id" });
        store.createIndex("byCase", "caseKey", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开案件数据库"));
  });
}

function asPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("案件数据库操作失败"));
  });
}

export function createIdbBackend(): CaseStoreBackend {
  return {
    async list() {
      const db = await openDatabase();
      try {
        const tx = db.transaction("cases", "readonly");
        const records = await asPromise(
          tx.objectStore("cases").getAll() as IDBRequest<InstalledCaseRecord[]>,
        );
        return records.sort((a, b) => a.importedAt - b.importedAt);
      } finally {
        db.close();
      }
    },
    async loadAudio(caseKey) {
      const db = await openDatabase();
      try {
        const tx = db.transaction("audio", "readonly");
        const rows = await asPromise(
          tx
            .objectStore("audio")
            .index("byCase")
            .getAll(caseKey) as IDBRequest<
            { name: string; blob: Blob }[]
          >,
        );
        return rows.map((row) => ({ name: row.name, blob: row.blob }));
      } finally {
        db.close();
      }
    },
    async install(record, audio) {
      const db = await openDatabase();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(["cases", "audio"], "readwrite");
          tx.objectStore("cases").put(record);
          const sounds = tx.objectStore("audio");
          for (const item of audio)
            sounds.put({
              id: `${record.key}/${item.name}`,
              caseKey: record.key,
              name: item.name,
              blob: item.blob,
            });
          tx.oncomplete = () => resolve();
          tx.onerror = () =>
            reject(tx.error ?? new Error("案件包写入失败"));
          tx.onabort = () =>
            reject(tx.error ?? new Error("案件包写入被中止"));
        });
      } finally {
        db.close();
      }
    },
  };
}

export function createMemoryBackend(): CaseStoreBackend & {
  failNextInstall(error: Error): void;
} {
  const cases = new Map<string, InstalledCaseRecord>();
  const audio = new Map<string, CaseAudioBlob[]>();
  let nextFailure: Error | null = null;
  return {
    failNextInstall(error) {
      nextFailure = error;
    },
    async list() {
      return [...cases.values()].sort((a, b) => a.importedAt - b.importedAt);
    },
    async loadAudio(caseKey) {
      return audio.get(caseKey) ?? [];
    },
    async install(record, blobs) {
      if (nextFailure) {
        const failure = nextFailure;
        nextFailure = null;
        throw failure;
      }
      cases.set(record.key, structuredClone(record));
      audio.set(
        record.key,
        blobs.map((item) => ({ ...item })),
      );
    },
  };
}
