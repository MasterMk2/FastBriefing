import { describe, expect, it } from 'vitest';
// @ts-expect-error Vitest executes this test in Node; this project intentionally omits @types/node.
import { readFile } from 'node:fs/promises';

type Palette = Record<string, string>;

function luminance(hex: string): number {
  const channels = hex.slice(1).match(/.{2}/g)!.map(value => Number.parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** Read the custom properties declared in one rule body, resolving var(--x) to values declared in the same body. */
function parseDeclarations(body: string): Palette {
  const declarations: Palette = {};
  for (const match of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    declarations[match[1]] = match[2].trim();
  }
  for (const [name, value] of Object.entries(declarations)) {
    const reference = /^var\(--([\w-]+)\)$/.exec(value);
    if (reference && declarations[reference[1]]) declarations[name] = declarations[reference[1]];
  }
  return declarations;
}

function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`selector not found: ${selector}`);
  const end = css.indexOf('}', start);
  return css.slice(start, end);
}

/** Read tokens.css with LF newlines so selector matching is independent of checkout line endings. */
async function readTokens(): Promise<string> {
  const css = await readFile(new URL('./styles/tokens.css', import.meta.url), 'utf8') as string;
  return css.replace(/\r\n/g, '\n');
}

const TEXT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['text', 'surface-0'],
  ['text', 'surface-1'],
  ['text', 'surface-2'],
  ['text-muted', 'surface-0'],
  ['text-muted', 'surface-1'],
  ['primary-text', 'primary-bg'],
  ['accent-text', 'accent'],
  ['info-text', 'surface-0'],
  ['info-text', 'info-bg'],
  ['success-text', 'surface-0'],
  ['success-text', 'success-bg'],
  ['warning-text', 'surface-0'],
  ['warning-text', 'warning-bg'],
  ['danger-text', 'surface-0'],
  ['danger-text', 'danger-bg'],
];

describe('theme token contrast', () => {
  it('keeps every text pair above the WCAG AA text threshold in all three themes', async () => {
    const css = await readTokens();
    const themes: Record<string, Palette> = {
      ffs: parseDeclarations(ruleBody(css, ':root,\n:root[data-theme="ffs"]')),
      standard: parseDeclarations(ruleBody(css, ':root[data-theme="standard"]')),
      night: parseDeclarations(ruleBody(css, ':root[data-theme="night"]')),
    };

    for (const [theme, palette] of Object.entries(themes)) {
      for (const [foreground, background] of TEXT_PAIRS) {
        const fg = palette[foreground];
        const bg = palette[background];
        expect(fg, `${theme}.${foreground}`).toMatch(/^#[0-9a-f]{6}$/i);
        expect(bg, `${theme}.${background}`).toMatch(/^#[0-9a-f]{6}$/i);
        expect(contrast(fg, bg), `${theme}: ${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps the FFS warning and danger text above 7:1 on the default surface, as measured in SPEC 4.2', async () => {
    const css = await readTokens();
    const ffs = parseDeclarations(ruleBody(css, ':root,\n:root[data-theme="ffs"]'));
    expect(contrast(ffs['warning-text'], ffs['surface-0'])).toBeGreaterThanOrEqual(7);
    expect(contrast(ffs['danger-text'], ffs['surface-0'])).toBeGreaterThanOrEqual(7);
  });
});
