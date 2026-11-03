import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../hooks/useSettings';
import type { DisplaySettings, MissionData, SupportAsset } from '../types/mission';
import type { KneeboardPage, KneeboardTranslate } from '../utils/kneeboard';
import { applyViewMode } from '../utils/viewMode';
import { buildExportModel } from './exportModel';
import { fixtureMission } from './__tests__/fixture';

/** Keeps the option values in the text, so a test can see which time or wind form was chosen. */
const t: KneeboardTranslate = (key, options) => `${key}${options ? JSON.stringify(options) : ''}`;

function pagesWith(settings: Partial<DisplaySettings>, mutate?: (view: MissionData) => void): KneeboardPage[] {
  const view = applyViewMode(fixtureMission(), 'creator', 'blue');
  mutate?.(view);
  return buildExportModel({
    view,
    settings: { ...DEFAULT_SETTINGS, viewMode: 'creator', ...settings },
    side: 'blue',
    scope: { kind: 'mission' },
    whiteboard: { notes: '', strokes: [] },
  }, t).pages;
}

function textLines(pages: KneeboardPage[], section: string): string[] {
  return pages.flatMap(page => (page.kind === 'text' && page.section === section
    ? page.sections.flatMap(item => item.lines)
    : []));
}

describe('export output follows the time display (D6, decision 6)', () => {
  const sections = { briefingSections: ['overview'] as DisplaySettings['briefingSections'] };

  it('shows only the Zulu start time when the time display is Zulu', () => {
    const lines = textLines(pagesWith({ ...sections, timeDisplay: 'zulu' }), 'overview');
    expect(lines.some(line => line.startsWith('export:label.startZulu'))).toBe(true);
    expect(lines.some(line => line.startsWith('export:label.startLocal'))).toBe(false);
  });

  it('shows only the local start time when the time display is local', () => {
    const lines = textLines(pagesWith({ ...sections, timeDisplay: 'local' }), 'overview');
    expect(lines.some(line => line.startsWith('export:label.startLocal'))).toBe(true);
    expect(lines.some(line => line.startsWith('export:label.startZulu'))).toBe(false);
  });

  it('shows both start times when the time display is both', () => {
    const lines = textLines(pagesWith({ ...sections, timeDisplay: 'both' }), 'overview');
    expect(lines.some(line => line.startsWith('export:label.startLocal'))).toBe(true);
    expect(lines.some(line => line.startsWith('export:label.startZulu'))).toBe(true);
  });
});

describe('export output follows the wind display (D5, decision 6)', () => {
  const windMission = (view: MissionData) => {
    view.weather.wind = [{ level: 'ground', from: 270, to: 90, speed: 5 }];
  };

  it('writes only the direction the wind comes from when the wind display is from', () => {
    const lines = textLines(pagesWith({ briefingSections: ['weather'], windDisplay: 'from' }, windMission), 'weather');
    const wind = lines.find(line => line.startsWith('export:label.wind '));
    expect(wind).toContain('export:label.windFrom{"deg":270}');
    expect(wind).not.toContain('export:label.windBoth');
  });

  it('writes only the direction the wind blows toward when the wind display is to', () => {
    const lines = textLines(pagesWith({ briefingSections: ['weather'], windDisplay: 'to' }, windMission), 'weather');
    const wind = lines.find(line => line.startsWith('export:label.wind '));
    expect(wind).toContain('export:label.windTo{"deg":90}');
    expect(wind).not.toContain('export:label.windBoth');
  });
});

describe('neutral support is not exported (decision 11)', () => {
  const support = (callsign: string) => ({
    kind: 'tanker', callsign, hidden: false, frequency: 251_000_000, position: [1, 2],
  }) as unknown as SupportAsset;

  it('leaves neutral support off the comms, support and map pages, and keeps blue and red support', () => {
    const pages = pagesWith({ briefingSections: ['comms', 'support', 'map'] }, view => {
      view.coalitions.blue.support = [support('BlueTanker')];
      view.coalitions.red.support = [support('RedTanker')];
      view.coalitions.neutral.support = [support('NeutralTanker')];
    });
    const content = JSON.stringify(pages);
    expect(content).toContain('BlueTanker');
    expect(content).toContain('RedTanker');
    expect(content).not.toContain('NeutralTanker');
  });
});

describe('export map pages follow the basemap setting (decision 6)', () => {
  it('marks every map page as not wanting a basemap when the setting is off', () => {
    const maps = pagesWith({ briefingSections: ['map'], mapBackground: false }).filter(page => page.kind === 'map');
    expect(maps.length).toBeGreaterThan(0);
    for (const page of maps) {
      expect(page.kind === 'map' && page.scene.basemap).toBe(false);
    }
  });

  it('marks every map page as wanting a basemap when the setting is on', () => {
    const maps = pagesWith({ briefingSections: ['map'], mapBackground: true }).filter(page => page.kind === 'map');
    expect(maps.length).toBeGreaterThan(0);
    for (const page of maps) {
      expect(page.kind === 'map' && page.scene.basemap).toBe(true);
    }
  });
});
