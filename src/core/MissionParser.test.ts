import { afterEach, describe, expect, it, vi } from 'vitest';
import { fingerprintMissionArchive, MissionParser, ZIP_LIMITS } from './MissionParser';

interface WorkerResponse {
  type: string;
  data?: unknown;
  code?: 'invalid-zip' | 'safety-limit' | 'invalid-mission';
  error?: string;
}

class FakeWorker {
  static latest: FakeWorker | undefined;
  static autoRespond = true;
  static response: WorkerResponse | undefined;

  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postedMessage: unknown;
  transferList: Transferable[] | undefined;
  terminated = false;

  constructor(_url: URL, _options: WorkerOptions) {
    FakeWorker.latest = this;
  }

  postMessage(message: unknown, transfer?: Transferable[]) {
    this.postedMessage = message;
    this.transferList = transfer;
    if (!FakeWorker.autoRespond) return;
    queueMicrotask(() => {
      this.onmessage?.({
        data: FakeWorker.response ?? {
          type: 'success',
          data: {
            mission: {},
            theatre: 'Caucasus',
            warehouses: {},
            options: {},
            dictionary: {},
            mapResource: {},
            kneeboardFiles: new Map(),
            briefingImages: new Map(),
          },
        },
      } as MessageEvent<WorkerResponse>);
    });
  }

  terminate() {
    this.terminated = true;
  }
}

describe('MissionParser', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeWorker.latest = undefined;
    FakeWorker.autoRespond = true;
    FakeWorker.response = undefined;
  });

  it('FileのArrayBufferを解決してWorkerへ転送する', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const buffer = new ArrayBuffer(8);
    const file = {
      arrayBuffer: vi.fn().mockResolvedValue(buffer),
    } as unknown as File;

    const result = await new MissionParser().parse(file);
    const worker = FakeWorker.latest;

    expect(file.arrayBuffer).toHaveBeenCalledOnce();
    expect(worker?.postedMessage).toEqual({ file: buffer });
    expect(worker?.transferList).toEqual([buffer]);
    expect(result.theatre).toBe('Caucasus');
    expect(result.sourceFingerprint).toMatch(/^(?:[a-f0-9]{64}|hash128-)/);
    expect(worker?.terminated).toBe(true);
  });

  it('同じメタデータでも異なるアーカイブ内容には異なる指紋を付ける', async () => {
    const first = await fingerprintMissionArchive(Uint8Array.from([1, 2, 3]).buffer);
    const second = await fingerprintMissionArchive(Uint8Array.from([1, 2, 4]).buffer);

    expect(first).not.toBe(second);
    expect(await fingerprintMissionArchive(Uint8Array.from([1, 2, 3]).buffer)).toBe(first);
  });

  it('SubtleCryptoが失敗しても幅広い内容指紋へ安定してフォールバックする', async () => {
    vi.stubGlobal('crypto', {
      subtle: { digest: vi.fn().mockRejectedValue(new Error('unavailable')) },
    });
    const input = Uint8Array.from([10, 20, 30, 40]).buffer;
    const first = await fingerprintMissionArchive(input);
    const second = await fingerprintMissionArchive(Uint8Array.from([10, 20, 30, 41]).buffer);

    expect(first).toMatch(/^hash128-[a-f0-9]{32}-4$/);
    expect(await fingerprintMissionArchive(input)).toBe(first);
    expect(second).not.toBe(first);
  });

  it('圧縮後サイズが上限ちょうどならarrayBufferを呼び出す', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const buffer = new ArrayBuffer(8);
    const file = {
      size: ZIP_LIMITS.MAX_ARCHIVE_SIZE,
      arrayBuffer: vi.fn().mockResolvedValue(buffer),
    } as unknown as File;

    await expect(new MissionParser().parse(file)).resolves.toBeTruthy();
    expect(file.arrayBuffer).toHaveBeenCalledOnce();
  });

  it('0バイトはarrayBufferとWorker生成の前に専用コードで拒否する', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const file = {
      size: 0,
      arrayBuffer: vi.fn(),
    } as unknown as File;

    await expect(new MissionParser().parse(file)).rejects.toMatchObject({
      name: 'MissionLoadError',
      code: 'empty-file',
    });
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(FakeWorker.latest).toBeUndefined();
  });

  it('圧縮後サイズが上限を1バイト超える場合はarrayBuffer前に拒否する', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const file = {
      size: ZIP_LIMITS.MAX_ARCHIVE_SIZE + 1,
      arrayBuffer: vi.fn(),
    } as unknown as File;

    await expect(new MissionParser().parse(file)).rejects.toMatchObject({
      code: 'archive-too-large',
      message: expect.stringContaining('上限'),
    });
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(FakeWorker.latest).toBeUndefined();
  });

  it('Workerが返した破損ZIP分類を呼び出し側へ保持する', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    FakeWorker.response = {
      type: 'error',
      code: 'invalid-zip',
      error: 'ZIPの構造を読み取れませんでした。',
    };
    const file = {
      size: 8,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    } as unknown as File;

    await expect(new MissionParser().parse(file)).rejects.toMatchObject({
      name: 'MissionLoadError',
      code: 'invalid-zip',
      message: 'ZIPの構造を読み取れませんでした。',
    });
  });

  it('cancelが解析PromiseをAbortErrorでrejectしWorkerを終了する', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    FakeWorker.autoRespond = false;
    const buffer = new ArrayBuffer(8);
    const file = {
      size: buffer.byteLength,
      arrayBuffer: vi.fn().mockResolvedValue(buffer),
    } as unknown as File;
    const parser = new MissionParser();
    const promise = parser.parse(file);

    await vi.waitFor(() => expect(FakeWorker.latest).toBeDefined());
    parser.cancel();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeWorker.latest?.terminated).toBe(true);
  });
});
