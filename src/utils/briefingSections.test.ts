import { describe, expect, it } from 'vitest';
import {
  BRIEFING_SECTIONS,
  DEFAULT_BRIEFING_SECTIONS,
  hasBriefingSection,
  migrateLegacyBriefingSections,
  moveBriefingSection,
  normalizeBriefingPresets,
  normalizeBriefingSections,
} from './briefingSections';

describe('briefing section selection', () => {
  it('uses the complete default set when no selection was stored', () => {
    expect(normalizeBriefingSections(undefined)).toEqual(DEFAULT_BRIEFING_SECTIONS);
  });

  it('drops unknown and duplicate values while preserving user order', () => {
    expect(normalizeBriefingSections(['notes', 'unknown', 'overview', 'notes'])).toEqual([
      'notes',
      'overview',
    ]);
  });

  it('maps the retired whiteboard id to notes once, and is stable when normalized again', () => {
    const once = normalizeBriefingSections(['whiteboard', 'overview', 'notes']);
    expect(once).toEqual(['notes', 'overview']);
    expect(normalizeBriefingSections(once)).toEqual(once);
  });

  it('uses the nine SPEC 6.2 sections in order', () => {
    expect(BRIEFING_SECTIONS).toEqual([
      'overview', 'weather', 'flights', 'route', 'comms', 'support', 'threats', 'map', 'notes',
    ]);
  });

  it('adds route after flights only for a legacy selection that had flights', () => {
    expect(migrateLegacyBriefingSections(['overview', 'weather', 'flights', 'map'])).toEqual([
      'overview', 'weather', 'flights', 'route', 'map',
    ]);
    expect(migrateLegacyBriefingSections(['map', 'weather'])).toEqual(['map', 'weather']);
    expect(migrateLegacyBriefingSections(['flights', 'route'])).toEqual(['flights', 'route']);
  });

  it('adds weather after overview only for a legacy selection that had overview', () => {
    expect(migrateLegacyBriefingSections(['overview', 'flights', 'map'])).toEqual([
      'overview', 'weather', 'flights', 'route', 'map',
    ]);
    expect(migrateLegacyBriefingSections(['map', 'overview'])).toEqual(['map', 'overview', 'weather']);
    expect(migrateLegacyBriefingSections(['overview', 'weather'])).toEqual(['overview', 'weather']);
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
    expect(moveBriefingSection(['overview', 'map', 'notes'], 'notes', 1)).toEqual([
      'overview', 'notes', 'map',
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
