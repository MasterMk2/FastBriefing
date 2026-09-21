import { describe, expect, it } from 'vitest';
import type { KneeboardPage, KneeboardTranslate } from './kneeboard';
import {
  assertKneeboardRenderBudget,
  estimateKneeboardPageCount,
  MAX_KNEEBOARD_PIXELS,
} from './kneeboardRenderer';

const t: KneeboardTranslate = (key, options) => `${key}:${JSON.stringify(options ?? {})}`;

function textPage(title: string, text = 'normal'): KneeboardPage {
  return {
    kind: 'text',
    section: 'flights',
    title,
    sections: [{ heading: title, lines: [text] }],
  };
}

describe('kneeboard render budget', () => {
  it('accepts the normal seven-page maximum-width briefing', () => {
    expect(() => assertKneeboardRenderBudget(7, 3072, t)).not.toThrow();
  });

  it('rejects maximum-width output with many flights and a long valid note before rendering', () => {
    const pages = [
      ...Array.from({ length: 6 }, (_, index) => textPage(`Flight ${index + 1}`)),
      textPage('Long note', '作'.repeat(10_000)),
    ];
    const count = estimateKneeboardPageCount(pages);
    expect(count).toBeGreaterThan(10);
    expect(() => assertKneeboardRenderBudget(count, 3072, t)).toThrow('kneeboard.tooManyPixels');
    expect(count * 3072 * 4096).toBeGreaterThan(MAX_KNEEBOARD_PIXELS);
  });
});
