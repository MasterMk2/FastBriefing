import { describe, expect, it } from 'vitest';
import type { Coalition, DisplaySettings, Flight, MissionData } from '../types/mission';
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
    userNotes: { missionKey: 'fixture', smeac: { situation: 'Situation text', mission: '', execution: '', adminLogistics: '', commandSignal: '' }, perFlight: {}, waypoints: {}, mapAnnotations: [] },
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

  it('includes waypoint fields and map pin notes in exported Markdown', () => {
    const value = mission();
    const flight = {
      groupId: 7, name: 'Viper', callsign: 'Viper 1', type: 'F-16C_50', task: 'Strike',
      frequency: 305_000_000, modulation: 0, hidden: false, units: [],
      route: [{ index: 1, name: 'IP', action: 'Turning Point', xy: [0, 0], latlon: [42, 43], alt: 5000, altType: 'BARO', speed: 200, eta: 0, tasks: [] }],
    } as Flight;
    value.coalitions = {
      ...value.coalitions,
      blue: { ...value.coalitions.blue, flights: [flight] },
    };
    value.userNotes.waypoints['blue:7:0'] = { purpose: 'Attack IP', notes: '15,000 ft' };
    value.userNotes.mapAnnotations = [{ id: 'pin_1', kind: 'pin', position: [42, 43], label: 'Rally', notes: 'Orbit west', color: '#e53935' }];
    const settings: DisplaySettings = { ...DEFAULT_SETTINGS, briefingSections: ['flights', 'map'] };
    const markdown = buildBriefingMarkdown(value, settings, { notes: '', strokes: [] }, t);
    expect(markdown).toContain('| Attack IP | 15,000 ft |');
    expect(markdown).toContain('**Rally**: Orbit west');
  });
});
