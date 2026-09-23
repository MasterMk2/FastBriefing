import { describe, expect, it } from 'vitest';
// @ts-expect-error Vitest executes this test in Node; this project intentionally omits @types/node.
import { readdir, readFile } from 'node:fs/promises';
import { MissionLoadError, MissionParser } from '../core/MissionParser';
import { normalizeMission } from '../core/MissionNormalizer';
import { parseMissionArchive } from '../workers/missionParser';

declare const process: { env: Record<string, string | undefined> };

const smokeDirectory = process.env.SMOKE_MIZ_DIR?.trim() ?? '';
const expectedEmptyNames = (process.env.SMOKE_MIZ_EXPECT_EMPTY ?? '')
  .split(';')
  .map(name => name.trim())
  .filter(Boolean)
  .sort((left, right) => left.localeCompare(right));

function filePath(directory: string, name: string): string {
  return `${directory.replace(/[\\/]+$/, '')}/${name}`;
}

describe.skipIf(!smokeDirectory)('real .miz corpus parsing', () => {
  it('normalizes every non-empty archive and classifies the exact expected empty files', async () => {
    const names = (await readdir(smokeDirectory) as string[])
      .filter(name => /\.miz$/i.test(name))
      .sort((left, right) => left.localeCompare(right));
    const failures: string[] = [];
    const emptyNames: string[] = [];
    let normalizedCount = 0;

    for (const name of names) {
      const bytes = new Uint8Array(await readFile(filePath(smokeDirectory, name)));
      if (bytes.length === 0) {
        emptyNames.push(name);
        const emptyFile = {
          size: 0,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        } as unknown as File;
        try {
          await new MissionParser().parse(emptyFile);
          failures.push(`${name}: empty archive was accepted`);
        } catch (error) {
          if (!(error instanceof MissionLoadError) || error.code !== 'empty-file') {
            failures.push(`${name}: expected empty-file, received ${String(error)}`);
          }
        }
        continue;
      }

      try {
        const parsed = await parseMissionArchive(bytes);
        normalizeMission(parsed, { coordinateFormat: 'DDM', unitSystem: 'metric', viewMode: 'creator' });
        normalizedCount += 1;
      } catch (error) {
        failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    expect(names.length, 'SMOKE_MIZ_DIR に .miz がありません').toBeGreaterThan(0);
    expect(failures).toEqual([]);
    expect(emptyNames).toEqual(expectedEmptyNames);
    expect(normalizedCount).toBe(names.length - expectedEmptyNames.length);
    console.log(JSON.stringify({
      archiveCount: names.length,
      normalizedCount,
      emptyFiles: emptyNames,
      emptyClassification: 'empty-file',
    }));
  }, 120_000);
});
