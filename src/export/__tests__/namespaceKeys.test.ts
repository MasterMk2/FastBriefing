// @ts-expect-error Vitest executes this test in Node; this project intentionally omits @types/node.
import { readFile } from 'node:fs/promises';
// @ts-expect-error Vitest executes this test in Node; this project intentionally omits @types/node.
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The export code must name the namespace of every static key (`export:`, `shell:` ...). A key
 * without a prefix belongs to `legacy`, which is removed when the old tabs are removed (contract
 * §7.1), so the output would then show raw keys. Dynamic keys are not checked here.
 */
const EXPORT_SOURCES = [
  'utils/kneeboardRenderer.ts',
  'utils/missionMapRaster.ts',
  'export/printDocument.tsx',
  'export/kneeboardPlan.ts',
  'export/markdown.ts',
  'export/exportModel.ts',
  'export/useExportModel.ts',
  'screens/ExportScreen.tsx',
];

const staticKeyCall = /\bt\(\s*(['"`])([^'"`]*)\1/g;

describe('export code uses namespaced translation keys (contract 7.1)', () => {
  it('has a namespace prefix on every static key', async () => {
    const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
    const unprefixed: string[] = [];
    for (const relativePath of EXPORT_SOURCES) {
      const source = await readFile(`${sourceRoot}${relativePath}`, 'utf8');
      for (const match of source.matchAll(staticKeyCall)) {
        const key = match[2];
        if (!key.includes(':')) {
          unprefixed.push(`${relativePath}: ${key}`);
        }
      }
    }
    expect(unprefixed).toEqual([]);
  });
});
