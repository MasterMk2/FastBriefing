import { describe, expect, it } from 'vitest';
import type { DisplaySettings, MissionData } from '../types/mission';
import { MAX_WHITEBOARD_NOTES, MAX_WHITEBOARD_STROKES } from '../hooks/useWhiteboard';
import {
  buildBriefingPngSections,
  paginateBriefingPngSection,
  wrapBriefingPngLines,
} from './briefingPng';

const settings = {
  briefingSections: ['overview', 'flights', 'map', 'comms', 'support', 'threats', 'whiteboard'],
  temperatureUnit: 'C',
  pressureUnit: 'hPa',
  distanceUnit: 'nm',
} as DisplaySettings;

const mission = {
  sourceFingerprint: 'fixture',
  meta: {
    sortie: 'PNG Coverage',
    theatre: 'Sinai',
    date: { Year: 2026, Month: 9, Day: 21 },
    startTime: 3600,
    utcOffset: 3,
  },
  weather: {
    temperature: 24,
    qnh: { mmHg: 760, hPa: 1013, inHg: 29.92 },
    visibility: 20_000,
    clouds: { preset: '', label: 'FEW', base: 1800 },
    wind: [],
  },
  coalitions: {
    blue: {
      flights: [{
        callsign: 'Viper 1',
        name: 'Viper',
        type: 'F-16C',
        task: 'SEAD',
        frequency: 251_000_000,
        modulation: 0,
        route: [{}, {}],
        units: [{ radios: [{ channel: 1, frequency: 251, modulation: 0, name: 'Package' }] }],
      }],
      support: [{ kind: 'awacs', callsign: 'Darkstar', frequency: 255_000_000 }],
      zones: [{}, {}],
      drawings: [{}],
      aiGroups: [],
    },
    red: {
      flights: [],
      support: [],
      zones: [],
      drawings: [],
      aiGroups: [{ category: 'vehicle', type: 'SA-10', count: 4, threatRange: 80_000, detectionRange: 120_000 }],
    },
    neutral: { flights: [], support: [], zones: [], drawings: [], aiGroups: [] },
  },
} as unknown as MissionData;

const t = (key: string, options?: Record<string, string | number>) => (
  options ? `${key} ${Object.values(options).join(' ')}` : key
);

describe('briefing PNG content', () => {
  it('builds output content for every selected planner section', () => {
    const sections = buildBriefingPngSections(
      mission,
      settings,
      { notes: 'Hold west of IP', strokes: [] },
      t,
    );

    expect(sections.map(section => section.id)).toEqual(settings.briefingSections);
    const byId = Object.fromEntries(sections.map(section => [section.id, section.lines.join('\n')]));
    expect(byId.overview).toContain('Sinai');
    expect(byId.flights).toContain('Viper 1');
    expect(byId.map).toContain('2 2 1');
    expect(byId.comms).toContain('Package');
    expect(byId.support).toContain('Darkstar');
    expect(byId.threats).toContain('SA-10');
    expect(byId.whiteboard).toContain('Hold west of IP');
  });

  it('paginates maximum notes without dropping the reserved drawing page', () => {
    const notes = 'x'.repeat(MAX_WHITEBOARD_NOTES);
    const [section] = buildBriefingPngSections(
      mission,
      { ...settings, briefingSections: ['whiteboard'] },
      {
        notes,
        strokes: Array.from({ length: MAX_WHITEBOARD_STROKES }, (_, index) => ({
          id: `route-${index}`,
          color: '#175cd3',
          width: 6,
          points: [{ x: 1, y: 1 }],
        })),
      },
      t,
    );
    const wrapped = wrapBriefingPngLines(section.lines, value => value.length * 10, 100);
    const pages = paginateBriefingPngSection(section, wrapped);

    expect(pages[0].drawWhiteboard).toBe(true);
    expect(pages.slice(1).every(page => !page.drawWhiteboard)).toBe(true);
    expect(pages.flatMap(page => page.lines).join('')).toBe(notes);
    expect(pages.every(page => page.lines.length <= 36)).toBe(true);
  });
});
