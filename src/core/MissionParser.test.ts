import { afterEach, describe, expect, it, vi } from 'vitest';
import { MissionParser } from './MissionParser';

interface WorkerResponse {
  type: string;
  data?: unknown;
  error?: string;
}

class FakeWorker {
  static latest: FakeWorker | undefined;

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
});
