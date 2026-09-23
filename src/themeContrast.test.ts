import { describe, expect, it } from 'vitest';
// @ts-expect-error Vitest executes this test in Node; this project intentionally omits @types/node.
import { readFile } from 'node:fs/promises';

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

describe('header selector contrast', () => {
  it('keeps explicit selector and option colors above the WCAG AA text threshold', async () => {
    const css = await readFile(new URL('./index.css', import.meta.url), 'utf8') as string;
    expect(css).toContain('.header-controls select option');
    expect(css).toContain('color: var(--color-control-text)');
    expect(contrast('#1a1a1a', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#f4f1e9', '#202329')).toBeGreaterThanOrEqual(4.5);
  });
});
