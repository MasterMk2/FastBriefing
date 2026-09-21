import type { ParsedMissionFile } from '../types/mission';
import { ZIP_LIMITS } from '../workers/missionParser';

export { ZIP_LIMITS } from '../workers/missionParser';

export interface MissionParserResult extends ParsedMissionFile {
  briefingImages: Map<string, Uint8Array>;
  sourceFingerprint: string;
}

export async function fingerprintMissionArchive(buffer: ArrayBuffer): Promise<string> {
  try {
    const digest = await globalThis.crypto?.subtle?.digest('SHA-256', buffer);
    if (digest) {
      return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // Older or restricted browsers may not expose SubtleCrypto. The fallback still
    // keys the board from archive bytes rather than mutable mission metadata.
  }

  const bytes = new Uint8Array(buffer);
  let hashA = 0x811c9dc5;
  let hashB = 0x9e3779b9;
  let hashC = 0x85ebca6b;
  let hashD = 0xc2b2ae35;
  const yieldInterval = 1 << 20;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    hashA = Math.imul(hashA ^ byte, 0x01000193);
    hashB = Math.imul(hashB ^ byte, 0x5bd1e995);
    hashC = Math.imul(hashC ^ byte, 0x27d4eb2d);
    hashD = Math.imul(hashD ^ byte, 0x165667b1);
    if (index > 0 && index % yieldInterval === 0) {
      await new Promise<void>(resolve => globalThis.setTimeout(resolve, 0));
    }
  }
  const hex = (value: number) => (value >>> 0).toString(16).padStart(8, '0');
  return `hash128-${hex(hashA)}${hex(hashB)}${hex(hashC)}${hex(hashD)}-${bytes.byteLength}`;
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
      const sourceFingerprint = await fingerprintMissionArchive(buffer);
      if (request.settled) return;

      const worker = new Worker(new URL('../workers/missionParser.ts', import.meta.url), { type: 'module' });
      request.worker = worker;

      worker.onmessage = (e: MessageEvent<{ type: string; data?: MissionParserResult; error?: string }>) => {
        if (e.data.type === 'success') {
          if (this.settle(request)) resolve({ ...e.data.data!, sourceFingerprint });
        } else if (e.data.type === 'error') {
          if (this.settle(request)) reject(new Error(e.data.error));
        } else if (this.settle(request)) {
          reject(new Error('ミッション解析から不明な応答を受信しました。'));
        }
      };

      // ErrorEvent は Error ではないので、そのまま reject すると呼び出し側の
      // err.message が undefined になる。Error に包んでから渡す。
      worker.onerror = (err) => {
        if (this.settle(request)) {
          reject(new Error(err.message || 'ミッション解析ワーカーが異常終了しました。'));
        }
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
