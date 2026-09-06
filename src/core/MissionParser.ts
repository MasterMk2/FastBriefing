import type { ParsedMissionFile } from '../types/mission';

export class MissionParser {
  private worker: Worker | null = null;

  async parse(file: File): Promise<ParsedMissionFile> {
    // Promise の executor は async にできないので、Worker を起こす前に読み切る
    const buffer = await file.arrayBuffer();

    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../workers/missionParser.ts', import.meta.url), { type: 'module' });
      this.worker = worker;

      const dispose = () => {
        worker.terminate();
        if (this.worker === worker) this.worker = null;
      };

      worker.onmessage = (e: MessageEvent<{ type: string; data?: ParsedMissionFile; error?: string }>) => {
        if (e.data.type === 'success') {
          resolve(e.data.data!);
        } else if (e.data.type === 'error') {
          reject(new Error(e.data.error));
        }
        dispose();
      };

      worker.onerror = (err) => {
        reject(new Error(err.message || 'Mission parser worker failed'));
        dispose();
      };

      worker.postMessage({ file: buffer }, [buffer]);
    });
  }

  cancel() {
    this.worker?.terminate();
    this.worker = null;
  }
}