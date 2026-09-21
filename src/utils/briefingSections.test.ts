import { describe, expect, it } from 'vitest';
import {
  BRIEFING_SECTIONS,
  DEFAULT_BRIEFING_SECTIONS,
  hasBriefingSection,
  moveBriefingSection,
  normalizeBriefingPresets,
  normalizeBriefingSections,
} from './briefingSections';

describe('briefing section selection', () => {
  it('uses the complete default set when no selection was stored', () => {
    expect(normalizeBriefingSections(undefined)).toEqual(DEFAULT_BRIEFING_SECTIONS);
  });

  it('drops unknown and duplicate values while preserving user order', () => {
    expect(normalizeBriefingSections(['whiteboard', 'unknown', 'overview', 'whiteboard'])).toEqual([
      'whiteboard',
      'overview',
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

  it('moves a selected section to a bounded position', () => {
    expect(moveBriefingSection(['overview', 'map', 'whiteboard'], 'whiteboard', 1)).toEqual([
      'overview', 'whiteboard', 'map',
    ]);
    expect(moveBriefingSection(['overview', 'map'], 'overview', 99)).toEqual(['map', 'overview']);
  });

  it('normalizes named presets and rejects case-insensitive duplicates', () => {
    expect(normalizeBriefingPresets([
      { name: ' Pilot ', sections: ['map', 'overview', 'map'] },
      { name: 'pilot', sections: ['threats'] },
      { name: '', sections: [] },
    ])).toEqual([{ name: 'Pilot', sections: ['map', 'overview'] }]);
  });
});
