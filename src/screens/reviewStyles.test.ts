import { describe, expect, it } from 'vitest';
// @ts-expect-error Vitest executes this test in Node; this project intentionally omits @types/node.
import { readFile } from 'node:fs/promises';

// Stylesheet checks for fixes that are otherwise seen only when drawn (print, themes, touch sizes, motion).

async function readStylesheet(name: string): Promise<string> {
  const css = await readFile(new URL(`../styles/${name}`, import.meta.url), 'utf8') as string;
  return css.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The body of the first block whose selector list, as written, matches `selector`. */
function blockOf(css: string, selector: RegExp): string {
  const match = new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`block not found: ${selector.source}`);
  return match[1];
}

/** The body of an @media block whose condition contains `condition` (one level of nesting). */
function mediaBlocks(css: string, condition: string): string[] {
  const blocks: string[] = [];
  let from = 0;
  for (;;) {
    const start = css.indexOf('@media', from);
    if (start < 0) return blocks;
    const open = css.indexOf('{', start);
    let depth = 1;
    let index = open + 1;
    while (depth > 0 && index < css.length) {
      if (css[index] === '{') depth += 1;
      if (css[index] === '}') depth -= 1;
      index += 1;
    }
    if (css.slice(start, open).includes(condition)) blocks.push(css.slice(open + 1, index - 1));
    from = index;
  }
}

function hexLuminance(hex: string): number {
  const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(value => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [light, dark] = [hexLuminance(a), hexLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe('print stylesheet (PE-1, PE-5)', () => {
  it('lets the preview copy flow onto pages when printed from the preview', async () => {
    const print = mediaBlocks(await readStylesheet('print.css'), 'print').join('\n');
    const block = blockOf(print, /\.print-briefing,\s*html\[data-print-preview="on"\] \.print-briefing/);
    for (const rule of ['position: static', 'overflow: visible', 'inset: auto']) expect(block).toContain(rule);
  });

  it('prints black on white even when the app theme is dark', async () => {
    const css = await readStylesheet('print.css');
    expect(blockOf(css, /\n\.print-briefing/)).toContain('color-scheme: light');
    expect(blockOf(mediaBlocks(css, 'print').join('\n'), /html,\s*body/)).toContain('color-scheme: light');
  });

  it('keeps the spaces and line breaks of a free text (the mission description), in a monospaced font', async () => {
    const block = blockOf(await readStylesheet('print.css'), /\.print-pre/);
    expect(block).toMatch(/white-space:\s*pre-wrap/);
    expect(block).toMatch(/font-family:[^;]*monospace/);
  });
});

describe('night theme inks (A11Y-10)', () => {
  it('keeps every ink at 3:1 or more against the map ground', async () => {
    const night = blockOf(await readStylesheet('tokens.css'), /:root\[data-theme="night"\]/);
    const value = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(night)?.[1] ?? '';
    const ground = value('surface-1');
    for (const ink of ['ink-1', 'ink-2', 'ink-3', 'ink-4']) {
      expect(contrast(value(ink), ground), ink).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('motion and touch targets (A11Y-8, A11Y-9)', () => {
  it('stops the spinner when the system asks for reduced motion', async () => {
    const reduced = mediaBlocks(await readStylesheet('common.css'), 'prefers-reduced-motion').join('\n');
    expect(blockOf(reduced, /\.spinner/)).toContain('animation: none');
  });

  it.each([
    ['common.css', ['.app-error .btn', '.loading-overlay .btn']],
    ['comms.css', ['.comms-select', '.comms-button', '.comms-link', '.support-link', '.comms-screen summary']],
    ['shell.css', ['.shell .file-menu-item']],
    ['briefing.css', ['.briefing-check']],
  ])('gives the narrow-screen controls of %s the touch size', async (name, selectors) => {
    const narrow = mediaBlocks(await readStylesheet(name), '767px').join('\n');
    const touchRules = [...narrow.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter(match => match[2].includes('var(--target-touch)'))
      .map(match => match[1]);
    for (const selector of selectors) {
      expect(touchRules.some(rule => rule.split(',').map(item => item.trim()).includes(selector)), selector).toBe(true);
    }
  });
});
