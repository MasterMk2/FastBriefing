import { afterEach, describe, expect, it, vi } from 'vitest';
import { MissionParser, ZIP_LIMITS } from './MissionParser';

interface WorkerResponse {
  type: string;
  data?: unknown;
  error?: string;
}

class FakeWorker {
  static latest: FakeWorker | undefined;
  static autoRespond = true;

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
        data: {
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
    expect(worker?.terminated).toBe(true);
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

  it('圧縮後サイズが上限を1バイト超える場合はarrayBuffer前に拒否する', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const file = {
      size: ZIP_LIMITS.MAX_ARCHIVE_SIZE + 1,
      arrayBuffer: vi.fn(),
    } as unknown as File;

    await expect(new MissionParser().parse(file)).rejects.toThrow('上限');
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(FakeWorker.latest).toBeUndefined();
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

    await Promise.resolve();
    parser.cancel();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeWorker.latest?.terminated).toBe(true);
  });
});
