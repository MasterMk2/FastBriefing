import { describe, expect, it } from 'vitest';
// @ts-expect-error Vitest executes this test in Node; this project intentionally omits @types/node.
import { readFile } from 'node:fs/promises';

// Layout checks that are otherwise seen only when drawn: the cascade order of the width rules and the scroll
// frames of wide tables. The drawing itself (1280px and 375px) is checked in a browser by the Lead.

const STYLESHEETS = [
  'shell.css', 'overview.css', 'comms.css', 'flight.css', 'lineup.css', 'notes.css',
  'briefing.css', 'export.css', 'map.css', 'settings.css', 'initial.css', 'common.css',
];

async function readStylesheet(name: string): Promise<string> {
  const css = await readFile(new URL(`../styles/${name}`, import.meta.url), 'utf8') as string;
  return css.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
}

interface Rule {
  selectors: string[];
  properties: string[];
  body: string;
  /** Position of the rule (or of its @media block) in the file. */
  at: number;
}

interface MediaBlock {
  condition: string;
  at: number;
  rules: Rule[];
}

function parseRules(css: string, offset: number): Rule[] {
  return [...css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map(match => ({
    selectors: match[1].split(',').map(item => item.trim()).filter(Boolean),
    properties: [...match[2].matchAll(/(^|;)\s*([a-z-]+)\s*:/g)].map(item => item[2]),
    body: match[2],
    at: offset + (match.index ?? 0),
  }));
}

/** Top-level rules and @media blocks (one level of nesting, as the stylesheets are written). */
function parseStylesheet(css: string): { rules: Rule[]; media: MediaBlock[] } {
  const rules: Rule[] = [];
  const media: MediaBlock[] = [];
  let index = 0;
  let start = 0;
  while (index < css.length) {
    if (css.startsWith('@media', index)) {
      const open = css.indexOf('{', index);
      let depth = 1;
      let end = open + 1;
      while (depth > 0 && end < css.length) {
        if (css[end] === '{') depth += 1;
        if (css[end] === '}') depth -= 1;
        end += 1;
      }
      rules.push(...parseRules(css.slice(start, index), start));
      media.push({ condition: css.slice(index + 6, open).trim(), at: index, rules: parseRules(css.slice(open + 1, end - 1), open + 1) });
      index = end;
      start = end;
      continue;
    }
    index += 1;
  }
  rules.push(...parseRules(css.slice(start), start));
  return { rules, media };
}

function blockOf(css: string, selector: RegExp): string {
  const match = new RegExp(`(?:^|\\n|\\})\\s*${selector.source}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`block not found: ${selector.source}`);
  return match[1];
}

describe('width rules are not undone by a later rule (cascade order)', () => {
  it.each(STYLESHEETS)('%s: no top-level rule after an @media block sets the same property on the same selector', async name => {
    const { rules, media } = parseStylesheet(await readStylesheet(name));
    const undone: string[] = [];
    for (const block of media) {
      if (block.condition.includes('print')) continue;
      for (const inner of block.rules) {
        for (const later of rules.filter(rule => rule.at > block.at)) {
          for (const selector of inner.selectors.filter(item => later.selectors.includes(item))) {
            for (const property of inner.properties.filter(item => later.properties.includes(item))) {
              undone.push(`${selector} { ${property} } in @media ${block.condition}`);
            }
          }
        }
      }
    }
    expect(undone).toEqual([]);
  });

  it('hides the bottom tabs and the bottom sheet from 1280px, where the left rail is shown', async () => {
    const { rules, media } = parseStylesheet(await readStylesheet('shell.css'));
    const wide = media.filter(block => block.condition.includes('min-width: 1280px'));
    const hidden = wide.flatMap(block => block.rules).filter(rule => /display:\s*none/.test(rule.body));
    for (const selector of ['.bottom-tabs', '.bottom-sheet']) {
      expect(hidden.some(rule => rule.selectors.includes(selector)), selector).toBe(true);
      const shown = rules.filter(rule => rule.selectors.includes(selector) && rule.properties.includes('display'));
      const lastHide = Math.max(...wide.map(block => block.at));
      expect(shown.every(rule => rule.at < lastHide), `${selector} is shown after it is hidden`).toBe(true);
    }
  });
});

describe('wide tables scroll inside their frame on a phone (375px)', () => {
  // A visually hidden label (position: absolute) inside a table cell takes its containing block from the nearest
  // positioned ancestor. Without one it escapes the frame's overflow and widens the page (overview TOT, 375px).
  it.each([
    ['overview.css', /\.overview-table-wrap/],
    ['comms.css', /\.comms-table-wrap,\s*\.threats-table-wrap/],
    ['flight.css', /\.route-table-wrap/],
    ['flight.css', /\.flight-table-scroll/],
    ['flight.css', /\.flight-roster/],
    ['lineup.css', /\.lineup-table-scroll/],
    ['notes.css', /\.revision-table-scroll/],
    ['briefing.css', /\.briefing-table-wrap/],
    ['map.css', /\.map-dcs-table-wrap/],
  ])('%s: %s scrolls sideways and is the containing block of what it holds', async (name, selector) => {
    const block = blockOf(await readStylesheet(name), selector);
    expect(block).toMatch(/overflow(-x)?:\s*auto/);
    expect(block).toContain('position: relative');
    expect(block).toContain('min-width: 0');
  });
});
