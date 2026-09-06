import type { ParsedMissionFile } from '../types/mission';
import { ZIP_LIMITS } from '../workers/missionParser';

export { ZIP_LIMITS } from '../workers/missionParser';

export interface MissionParserResult extends ParsedMissionFile {
  briefingImages: Map<string, Uint8Array>;
}

interface ParseRequest {
  worker: Worker | null;
  reject: (reason?: unknown) => void;
  settled: boolean;
}

function formatBytes(bytes: number): string {
  return `${bytes.toLocaleString('ja-JP')}バイト`;
}

function archiveSizeError(size: number): Error {
  return new Error(
    `圧縮後のファイルサイズ（${formatBytes(size)}）が上限（${formatBytes(ZIP_LIMITS.MAX_ARCHIVE_SIZE)}）を超えています。`
  );
}

function abortError(): Error {
  const error = new Error('ミッション解析がキャンセルされました。');
  error.name = 'AbortError';
  return error;
}

export class MissionParser {
  private readonly requests = new Set<ParseRequest>();

  parse(file: File): Promise<MissionParserResult> {
    const request: ParseRequest = {
      worker: null,
      reject: () => undefined,
      settled: false,
    };
    this.requests.add(request);

    return new Promise((resolve, reject) => {
      request.reject = reject;
      void this.start(request, file, resolve, reject);
    });
  }

  private async start(
    request: ParseRequest,
    file: File,
    resolve: (value: MissionParserResult | PromiseLike<MissionParserResult>) => void,
    reject: (reason?: unknown) => void
  ): Promise<void> {
    try {
      // Reject before arrayBuffer() so an oversized archive never enters main-thread memory.
      if (file.size > ZIP_LIMITS.MAX_ARCHIVE_SIZE) {
        throw archiveSizeError(file.size);
      }

      const buffer = await file.arrayBuffer();
      if (request.settled) return;

      const worker = new Worker(new URL('../workers/missionParser.ts', import.meta.url), { type: 'module' });
      request.worker = worker;

      worker.onmessage = (e: MessageEvent<{ type: string; data?: MissionParserResult; error?: string }>) => {
        if (e.data.type === 'success') {
          if (this.settle(request)) resolve(e.data.data!);
        } else if (e.data.type === 'error') {
          if (this.settle(request)) reject(new Error(e.data.error));
        } else if (this.settle(request)) {
          reject(new Error('ミッション解析から不明な応答を受信しました。'));
        }
      };

      worker.onerror = (err) => {
        if (this.settle(request)) reject(err);
      };

      worker.postMessage({ file: buffer }, [buffer]);
    } catch (error) {
      if (this.settle(request)) reject(error);
    }
  }

  private settle(request: ParseRequest): boolean {
    if (request.settled) return false;
    request.settled = true;
    this.requests.delete(request);
    request.worker?.terminate();
    request.worker = null;
    return true;
  }

  cancel() {
    const error = abortError();
    for (const request of [...this.requests]) {
      if (this.settle(request)) request.reject(error);
    }
  }
}
