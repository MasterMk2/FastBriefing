import type { ParsedMissionFile } from '../types/mission';

export class MissionParser {
  private worker: Worker | null = null;
  
  async parse(file: File): Promise<ParsedMissionFile> {
    const buffer = await file.arrayBuffer();

    return new Promise((resolve, reject) => {
      this.worker = new Worker(new URL('../workers/missionParser.ts', import.meta.url), { type: 'module' });
      
      this.worker.onmessage = (e: MessageEvent<{ type: string; data?: ParsedMissionFile; error?: string }>) => {
        if (e.data.type === 'success') {
          resolve(e.data.data!);
        } else if (e.data.type === 'error') {
          reject(new Error(e.data.error));
        }
        this.worker?.terminate();
        this.worker = null;
      };
      
      this.worker.onerror = (err) => {
        reject(err);
        this.worker?.terminate();
        this.worker = null;
      };
      
      this.worker.postMessage({ file: buffer }, [buffer]);
    });
  }
  
  cancel() {
    this.worker?.terminate();
    this.worker = null;
  }
}
