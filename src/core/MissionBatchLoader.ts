export type FileSelectionError = 'invalidMizOnly' | 'tooManyFiles';

/** Reject the entire selection: never silently ignore a revision or other file. */
export function validateMissionFiles(files: readonly Pick<File, 'name'>[]): FileSelectionError | null {
  if (files.length > 2) return 'tooManyFiles';
  if (files.length === 0 || files.some(file => !file.name.toLowerCase().endsWith('.miz'))) return 'invalidMizOnly';
  return null;
}
interface Parser<T> { parse(file: File): Promise<T>; cancel(): void }

/** One active batch, serial parsing, atomic publication, and stale-result protection. */
export class MissionBatchLoader<T> {
  private generation = 0;
  private parser: Parser<T> | null = null;
  constructor(private readonly makeParser: () => Parser<T>) {}

  cancel(): void {
    this.generation += 1;
    this.parser?.cancel();
    this.parser = null;
  }

  async load(files: readonly File[]): Promise<T[] | null> {
    this.cancel();
    const generation = this.generation;
    const parser = this.makeParser();
    this.parser = parser;
    try {
      const results: T[] = [];
      for (const file of files) {
        if (generation !== this.generation) return null;
        const result = await parser.parse(file);
        if (generation !== this.generation) return null;
        results.push(result);
      }
      return results;
    } catch (error) {
      if (generation !== this.generation) return null;
      throw error;
    } finally {
      if (generation === this.generation) {
        parser.cancel();
        this.parser = null;
      }
    }
  }
}
