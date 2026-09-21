import { describe, expect, it } from 'vitest';
import {
  BRIEFING_SECTIONS,
  DEFAULT_BRIEFING_SECTIONS,
  hasBriefingSection,
  normalizeBriefingSections,
} from './briefingSections';

describe('briefing section selection', () => {
  it('uses the complete default set when no selection was stored', () => {
    expect(normalizeBriefingSections(undefined)).toEqual(DEFAULT_BRIEFING_SECTIONS);
  });

  it('drops unknown and duplicate values while restoring canonical order', () => {
    expect(normalizeBriefingSections(['whiteboard', 'unknown', 'overview', 'whiteboard'])).toEqual([
      'overview',
      'whiteboard',
    ]);
  });

  it('preserves an intentional empty selection', () => {
    expect(normalizeBriefingSections([])).toEqual([]);
  });

  it('reports membership without changing the selected array', () => {
    const selected = BRIEFING_SECTIONS.filter(section => section !== 'threats');
    expect(hasBriefingSection(selected, 'map')).toBe(true);
    expect(hasBriefingSection(selected, 'threats')).toBe(false);
  });
});
