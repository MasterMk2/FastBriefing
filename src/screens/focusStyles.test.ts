import { describe, expect, it } from 'vitest';
// @ts-expect-error Vitest executes this test in Node; this project intentionally omits @types/node.
import { readFile } from 'node:fs/promises';

/** Reads a stylesheet with LF newlines. Vitest returns CSS imports as empty text, so the file is read directly. */
async function readStylesheet(name: string): Promise<string> {
  const css = await readFile(new URL(`../styles/${name}`, import.meta.url), 'utf8') as string;
  return css.replace(/\r\n/g, '\n');
}

/** The values of the `outline` declarations in a stylesheet that name the focus-ring token. */
function focusRingOutlines(css: string): string[] {
  return [...css.matchAll(/outline\s*:\s*([^;]+);/g)]
    .map(match => match[1].trim())
    .filter(value => value.includes('--focus-ring'));
}

describe.each(['notes.css', 'initial.css'])('%s focus outline', name => {
  // The focus-ring token already holds the width, style and colour, so it must be the whole outline value.
  // Written as `2px solid var(--focus-ring)` the declaration is invalid and the keyboard focus outline disappears.
  it('uses the focus-ring token as the whole outline value', async () => {
    const rings = focusRingOutlines(await readStylesheet(name));
    expect(rings.length).toBeGreaterThan(0);
    expect(rings.filter(value => value !== 'var(--focus-ring)')).toEqual([]);
  });
});
