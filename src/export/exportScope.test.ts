import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../hooks/useSettings';
import type { DisplaySettings, MissionData } from '../types/mission';
import { applyViewMode } from '../utils/viewMode';
import { buildGeospatialExport } from '../utils/geospatialExport';
import { effectiveExportScope } from './useExportModel';
import { buildExportModel } from './exportModel';
import { fixtureMission } from './__tests__/fixture';

// Identity translator: every label is its key, so tests can check which label was used.
const t = (key: string) => key;
// Like t, but keeps the parameters, so a warning's values can be checked.
const withParams = (key: string, options?: Record<string, string | number>) => (options ? `${key} ${JSON.stringify(options)}` : key);

const settings = (overrides: Partial<DisplaySettings> = {}): DisplaySettings => ({
  ...DEFAULT_SETTINGS,
  viewMode: 'creator',
  side: 'blue',
  briefingSections: ['overview', 'flights', 'route', 'comms', 'notes'],
  ...overrides,
});

/** The fixture with a second blue flight, so that a one-flight extract has something to exclude. */
function missionWithTwoBlueFlights(): MissionData {
  const mission = fixtureMission();
  // A route needs two points to become a GeoJSON line, so the second point is added here.
  const withSecondPoint = (flight: MissionData['coalitions']['blue']['flights'][number]) => ({
    ...flight,
    route: [...flight.route, { ...flight.route[0], index: 2, name: 'WP2', latlon: [42.1, 43.1] as [number, number] }],
  });
  const viper = withSecondPoint(mission.coalitions.blue.flights[0]);
  const lynx = withSecondPoint({ ...mission.coalitions.blue.flights[0], groupId: 4, name: 'Lynx 1', callsign: 'Lynx 1' });
  mission.coalitions.blue.flights = [viper, lynx];
  return mission;
}

function allPageText(pages: unknown): string {
  return JSON.stringify(pages);
}

describe('one-flight extract (F9)', () => {
  it('writes no page of another flight, in the flight list, the nav log, the comms or the notes', () => {
    const mission = missionWithTwoBlueFlights();
    const view = applyViewMode(mission, 'creator', 'blue');
    const model = buildExportModel({
      view,
      settings: settings(),
      side: 'blue',
      scope: { kind: 'flights', flightKeys: ['blue:1'] },
      whiteboard: { notes: 'Board note', strokes: [] },
    }, t);
    const text = allPageText(model.pages);
    expect(text).toContain('Viper 1');
    expect(text).not.toContain('Lynx 1');
    expect(model.label).toBe('Viper 1');
  });

  it('keeps every flight when the scope is the whole mission', () => {
    const view = applyViewMode(missionWithTwoBlueFlights(), 'creator', 'blue');
    const model = buildExportModel({
      view,
      settings: settings(),
      side: 'blue',
      scope: { kind: 'mission' },
      whiteboard: { notes: '', strokes: [] },
    }, t);
    const text = allPageText(model.pages);
    expect(text).toContain('Viper 1');
    expect(text).toContain('Lynx 1');
  });
});

describe('warnings follow the view (D1, migrated from PrintView.test)', () => {
  function missionWithIssues(): MissionData {
    const mission = fixtureMission();
    mission.issues = [
      { code: 'unit.unknownType', severity: 'info', params: { type: 'OWN-UNKNOWN' }, side: 'blue' },
      { code: 'unit.unknownType', severity: 'info', params: { type: 'SECRET-RED-SAM' }, side: 'red' },
      { code: 'map.unsupported', severity: 'warning', params: { theatre: 'Test' } },
    ];
    return mission;
  }

  function warningsOf(mode: 'creator' | 'pilot', side: 'blue' | 'red'): string {
    const view = applyViewMode(missionWithIssues(), mode, side);
    const model = buildExportModel({
      view,
      settings: settings({ viewMode: mode, side, briefingSections: ['overview'] }),
      side,
      scope: { kind: 'mission' },
      whiteboard: { notes: '', strokes: [] },
    }, withParams);
    return allPageText(model.pages);
  }

  it('lists the opposing side issue in creator view', () => {
    const text = warningsOf('creator', 'blue');
    expect(text).toContain('SECRET-RED-SAM');
    expect(text).toContain('OWN-UNKNOWN');
  });

  it('does not print the opposing side issue in pilot view, but keeps the displayed side and whole-mission issues', () => {
    const text = warningsOf('pilot', 'blue');
    expect(text).not.toContain('SECRET-RED-SAM');
    expect(text).toContain('OWN-UNKNOWN');
    expect(text).toContain('issues:map.unsupported');
  });

  it('prints the red issue and hides the blue one when red is displayed in pilot view', () => {
    const text = warningsOf('pilot', 'red');
    expect(text).toContain('SECRET-RED-SAM');
    expect(text).not.toContain('OWN-UNKNOWN');
  });
});

describe('pilot view side scope (D1)', () => {
  it('reads a stored scope for the other side as the displayed side', () => {
    expect(effectiveExportScope({ kind: 'side', side: 'red' }, 'pilot', 'blue')).toEqual({ kind: 'side', side: 'blue' });
  });

  it('keeps the stored scope in creator view and for the displayed side', () => {
    expect(effectiveExportScope({ kind: 'side', side: 'red' }, 'creator', 'blue')).toEqual({ kind: 'side', side: 'red' });
    const same = { kind: 'side' as const, side: 'blue' as const };
    expect(effectiveExportScope(same, 'pilot', 'blue')).toBe(same);
  });
});

describe('GeoJSON and KML follow the target (F9)', () => {
  it('writes only the routes of the selected flights when the target is a flight', () => {
    const mission = missionWithTwoBlueFlights();
    const result = buildGeospatialExport(mission, 'creator', 'blue', { flightKeys: new Set(['blue:1']) });
    const names = result.features.filter(feature => feature.properties.kind === 'route').map(feature => feature.properties.name);
    expect(names).toEqual(['Viper 1']);
    // Map annotations and zones are mission-wide, so a flight target leaves them out.
    expect(result.features.some(feature => feature.properties.kind === 'map-pin')).toBe(false);
    expect(result.features.some(feature => feature.properties.kind === 'zone')).toBe(false);
  });

  it('keeps the whole mission when no flight filter is given', () => {
    const mission = missionWithTwoBlueFlights();
    const result = buildGeospatialExport(mission, 'creator', 'blue');
    const names = result.features.filter(feature => feature.properties.kind === 'route').map(feature => feature.properties.name);
    expect(names).toEqual(expect.arrayContaining(['Viper 1', 'Lynx 1']));
  });
});
