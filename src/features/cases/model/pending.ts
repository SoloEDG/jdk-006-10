import type { CaseContent } from "../../../shared/types";
import type { BundleSummary, UnpackedCase } from "./bundle";

export interface InstalledCaseRecord {
  key: string;
  caseId: string;
  title: string;
  summary: string;
  contentHash: string;
  importedAt: number;
  totalSize: number;
  audio: { name: string; size: number; sha256: string }[];
  content: CaseContent;
}

export class PendingBundle {
  readonly summary: BundleSummary;
  readonly record: InstalledCaseRecord;
  private blobs = new Map<string, Blob>();
  private urls = new Map<string, string>();
  private disposed = false;

  constructor(unpacked: UnpackedCase) {
    this.summary = unpacked.summary;
    for (const [name, bytes] of unpacked.audio) {
      const blob = new Blob([new Uint8Array(bytes)]);
      this.blobs.set(name, blob);
      this.urls.set(name, URL.createObjectURL(blob));
    }
    this.record = {
      key: unpacked.summary.key,
      caseId: unpacked.summary.caseId,
      title: unpacked.summary.title,
      summary: unpacked.summary.summary,
      contentHash: unpacked.summary.contentHash,
      importedAt: Date.now(),
      totalSize: unpacked.summary.totalSize,
      audio: unpacked.summary.audio,
      content: unpacked.content,
    };
  }

  audioUrl(name: string): string | null {
    return this.disposed ? null : (this.urls.get(name) ?? null);
  }

  audioBlob(name: string): Blob | null {
    return this.disposed ? null : (this.blobs.get(name) ?? null);
  }

  audioBlobs(): { name: string; blob: Blob }[] {
    return [...this.blobs.entries()].map(([name, blob]) => ({ name, blob }));
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
    this.blobs.clear();
  }
}
