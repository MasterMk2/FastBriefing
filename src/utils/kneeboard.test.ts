import { describe, expect, it } from 'vitest';
import type { MissionData } from '../types/mission';
import { DEFAULT_SETTINGS } from '../hooks/useSettings';
import type { BriefingSection } from './briefingSections';
import { planKneeboardPages } from './kneeboard';

function fixture(): MissionData {
  const flight = (callsign: string, groupId: number, hidden: boolean, type: string) => ({
    callsign, groupId, hidden, type, task: 'CAP', frequency: 305_000_000,
    units: [{ radios: [] }],
    route: [{ index: 1, name: 'START', xy: [0, 0], latlon: [41, 42], alt: 5000, speed: 200, eta: 0 }],
  });
  const coalition = { flights: [], support: [], zones: [], aiGroups: [], drawings: [] };
  return {
    meta: {
      sortie: 'Test sortie', theatre: 'Caucasus', description: 'Mission details',
      date: { Year: 2026, Month: 9, Day: 21 }, startTime: 3600, utcOffset: 3,
    },
    weather: {
      temperature: 20, qnh: { hPa: 1013, mmHg: 760, inHg: 29.92 },
      visibility: 10000, clouds: { label: 'Clear', base: 2000 }, wind: [],
    },
    coalitions: {
      blue: { ...coalition, flights: [flight('Visible', 1, false, 'F-16C_50'), flight('Hidden', 2, true, 'F-16C_50')] },
      red: { ...coalition, flights: [flight('Other', 3, false, 'FA-18C_hornet')] },
      neutral: coalition,
    },
    userNotes: {
      missionKey: 'test',
      smeac: { situation: 'Friendly forces', mission: '', execution: '', adminLogistics: '', commandSignal: '' },
      perFlight: { 'blue:1': { pilotName: 'Pilot', customNotes: 'Hold north' } },
    },
  } as unknown as MissionData;
}

const settings = { ...DEFAULT_SETTINGS, viewMode: 'pilot' as const };
const translate = (key: string) => key;

describe('kneeboard plan', () => {
  it('includes notes, nav logs and comms while filtering hidden flights', () => {
    const pages = planKneeboardPages(fixture(), settings, translate);
    expect(pages.map(page => page.section)).toEqual([
      'overview', 'notes', 'flights', 'flights', 'map', 'comms', 'support', 'threats', 'whiteboard',
    ]);
    const content = JSON.stringify(pages);
    expect(content).toContain('Friendly forces');
    expect(content).toContain('Hold north');
    expect(content).not.toContain('Hidden');
  });

  it('limits pages to one aircraft type', () => {
    const pages = planKneeboardPages(fixture(), settings, translate, 'FA-18C_hornet');
    expect(JSON.stringify(pages)).toContain('Other');
    expect(JSON.stringify(pages)).not.toContain('Visible');
  });

  it('splits maps so every flight has a legend entry', () => {
    const mission = fixture();
    mission.coalitions.blue.flights.push(...Array.from({ length: 4 }, (_, index) => ({
      ...mission.coalitions.blue.flights[0], callsign: `Extra ${index + 1}`, groupId: 10 + index,
    })));
    const maps = planKneeboardPages(mission, settings, translate).filter(page => page.kind === 'map');
    expect(maps.map(page => page.title)).toEqual(['kneeboard.map 1/2', 'kneeboard.map 2/2']);
    expect(maps.flatMap(page => page.scene.routes.map(route => route.label))).toEqual([
      'Visible', 'Extra 1', 'Extra 2', 'Extra 3', 'Extra 4', 'Other',
    ]);
  });

  it('follows planner selection and order for every section family', () => {
    const ordered = { ...settings, briefingSections: ['whiteboard', 'map', 'overview'] as BriefingSection[] };
    const pages = planKneeboardPages(fixture(), ordered, translate, null, { notes: 'board', strokes: [] });
    expect(pages.map(page => page.section)).toEqual(['whiteboard', 'map', 'overview']);
  });
});
