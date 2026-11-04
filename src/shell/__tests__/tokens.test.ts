import { describe, expect, it } from 'vitest';
// @ts-expect-error Vitest executes this test in Node; this project intentionally omits @types/node.
import { readFile } from 'node:fs/promises';

type Palette = Record<string, string>;
type ThemeId = 'ffs' | 'standard' | 'night';

const THEME_SELECTORS: Record<ThemeId, string> = {
  ffs: ':root,\n:root[data-theme="ffs"]',
  standard: ':root[data-theme="standard"]',
  night: ':root[data-theme="night"]',
};

/** Reads tokens.css with LF newlines (vitest does not return CSS imports, so the file is read directly). */
async function readTokens(): Promise<string> {
  const css = await readFile(new URL('../../styles/tokens.css', import.meta.url), 'utf8') as string;
  return css.replace(/\r\n/g, '\n');
}

/** The declarations of one theme rule body (a plain text reader, enough for the flat token blocks). */
async function themePalette(theme: ThemeId): Promise<Palette> {
  const css = await readTokens();
  const selector = THEME_SELECTORS[theme];
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`selector not found: ${selector}`);
  const body = css.slice(start, css.indexOf('}', start));
  const palette: Palette = {};
  for (const match of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    palette[match[1]] = match[2].trim();
  }
  return palette;
}

function luminance(hex: string): number {
  const channels = hex.slice(1).match(/.{2}/g)!.map(value => Number.parseInt(value, 16) / 255)
    .map(value => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const SIDE_TOKENS = [
  'side-blue', 'side-blue-text', 'side-red', 'side-red-text', 'side-neutral', 'side-neutral-text',
] as const;
const INK_TOKENS = ['ink-1', 'ink-2', 'ink-3', 'ink-4'] as const;
const THEMES = Object.keys(THEME_SELECTORS) as ThemeId[];

describe('coalition and ink tokens', () => {
  it.each(THEMES)('defines every side and ink colour as a hex value in the %s theme', async theme => {
    const palette = await themePalette(theme);
    for (const token of [...SIDE_TOKENS, ...INK_TOKENS]) {
      expect(palette[token], `${theme}.${token}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it.each(THEMES)('keeps the side words above 4.5:1 on the surface in the %s theme', async theme => {
    const palette = await themePalette(theme);
    for (const token of ['side-blue-text', 'side-red-text', 'side-neutral-text']) {
      expect(contrast(palette[token], palette['surface-0']), `${theme}: ${token}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the four night-red inks apart by lightness (each step at least 1.3:1 from the next)', async () => {
    const palette = await themePalette('night');
    for (let index = 0; index < INK_TOKENS.length - 1; index += 1) {
      const current = INK_TOKENS[index];
      const next = INK_TOKENS[index + 1];
      expect(contrast(palette[current], palette[next]), `${current} against ${next}`).toBeGreaterThanOrEqual(1.3);
    }
  });
});

describe('whiteboard paper tokens (theme-independent)', () => {
  it('defines the paper and grid once in the shared block, light enough for dark ink, and in no theme block', async () => {
    const css = await readTokens();
    const shared = css.slice(css.indexOf('/* Shared, theme-independent tokens. */'));
    const paper = /--whiteboard-paper:\s*(#[0-9a-f]{6});/i.exec(shared)?.[1];
    const grid = /--whiteboard-grid:\s*(#[0-9a-f]{6});/i.exec(shared)?.[1];
    expect(paper).toBeDefined();
    expect(grid).toBeDefined();
    expect(luminance(paper!)).toBeGreaterThan(0.8);
    for (const theme of THEMES) {
      const palette = await themePalette(theme);
      expect(palette['whiteboard-paper'], theme).toBeUndefined();
    }
  });

  it('draws the whiteboard paper and grid from the tokens, not from fixed colours', async () => {
    const source = await readFile(new URL('../../components/WhiteboardDrawing.tsx', import.meta.url), 'utf8') as string;
    expect(source).toContain("'var(--whiteboard-paper)'");
    expect(source).toContain("'var(--whiteboard-grid)'");
    expect(source).not.toMatch(/#[0-9a-f]{6}\b/i);
  });
});
