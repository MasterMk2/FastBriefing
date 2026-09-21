import { describe, expect, it } from 'vitest';
import type { Coalition, DisplaySettings, MissionData } from '../types/mission';
import { DEFAULT_SETTINGS } from '../hooks/useSettings';
import { buildBriefingMarkdown } from './briefingMarkdown';

const t = (key: string) => key;

function mission(): MissionData {
  const coalition: Coalition = { bullseye: { xy: [0, 0], latlon: [1, 1] }, navPoints: [], airbases: [], flights: [], support: [], aiGroups: [], zones: [], drawings: [] };
  return {
    sourceFingerprint: 'fixture',
    meta: { sortie: 'Order Test', description: '', descriptionBlueTask: '', descriptionRedTask: '', descriptionNeutralTask: '', theatre: 'Caucasus', date: { Year: 2026, Month: 9, Day: 21 }, startTime: 0, utcOffset: 3, meVersion: 1, images: [] },
    weather: { temperature: 20, qnh: { hPa: 1013, mmHg: 760, inHg: 29.92 }, wind: [], clouds: { preset: '', label: 'Clear', base: 0 }, visibility: 10000, fog: { thickness: 0, visibility: 0, enabled: false }, dust: { density: 0, enabled: false }, turbulence: { ground: 0 } },
    coalitions: { blue: coalition, red: coalition, neutral: coalition },
    userNotes: { missionKey: 'fixture', smeac: { situation: 'Situation text', mission: '', execution: '', adminLogistics: '', commandSignal: '' }, perFlight: {} },
    warnings: [],
  };
}

describe('briefing Markdown', () => {
  it('emits only selected sections in planner order', () => {
    const settings: DisplaySettings = { ...DEFAULT_SETTINGS, briefingSections: ['whiteboard', 'notes', 'map'] };
    const markdown = buildBriefingMarkdown(mission(), settings, { notes: 'Board text', strokes: [] }, t);
    const whiteboard = markdown.indexOf('export.markdown.whiteboard');
    const notes = markdown.indexOf('planner.sections.notes');
    const map = markdown.indexOf('export.markdown.mapSection');

    expect(whiteboard).toBeGreaterThan(0);
    expect(notes).toBeGreaterThan(whiteboard);
    expect(map).toBeGreaterThan(notes);
    expect(markdown).not.toContain('export.markdown.flightList');
  });
});
