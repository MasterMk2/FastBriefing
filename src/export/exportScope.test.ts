import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../hooks/useSettings';
import type { DisplaySettings, MissionData } from '../types/mission';
import { applyViewMode } from '../utils/viewMode';
import { buildGeospatialExport } from '../utils/geospatialExport';
import { effectiveExportScope } from './useExportModel';
import { buildExportModel, resolveExportSide } from './exportModel';
import type { ExportScope } from './exportPlan';
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

  it('leaves the own threat issues out of the pilot output, as the overview screen does (TI-1)', () => {
    const mission = missionWithIssues();
    mission.issues.push({ code: 'threat.rangeUnrecorded', severity: 'info', params: { type: 'OWN-SAM' }, side: 'blue' });
    const build = (mode: 'creator' | 'pilot') => allPageText(buildExportModel({
      view: applyViewMode(mission, mode, 'blue'),
      settings: settings({ viewMode: mode, side: 'blue', briefingSections: ['overview'] }),
      side: 'blue',
      scope: { kind: 'mission' },
      whiteboard: { notes: '', strokes: [] },
    }, withParams).pages);
    expect(build('pilot')).not.toContain('issues:threat.rangeUnrecorded');
    expect(build('creator')).toContain('issues:threat.rangeUnrecorded');
  });

  it('prints the red issue and hides the blue one when red is displayed in pilot view', () => {
    const text = warningsOf('pilot', 'red');
    expect(text).toContain('SECRET-RED-SAM');
    expect(text).not.toContain('OWN-UNKNOWN');
  });
});

describe('the output side follows the target (PE-4)', () => {
  function redHandout(scope: ExportScope): string {
    const mission = fixtureMission();
    mission.meta.descriptionBlueTask = 'BLUE TASK';
    mission.meta.descriptionRedTask = 'RED TASK';
    const model = buildExportModel({
      view: applyViewMode(mission, 'creator', 'blue'),
      settings: settings({ viewMode: 'creator', side: 'blue', briefingSections: ['overview', 'threats'] }),
      side: 'blue',
      scope,
      whiteboard: { notes: '', strokes: [] },
    }, t);
    return allPageText(model.pages);
  }

  it('writes a red-side handout from red: the red task, and no red group as a threat', () => {
    const scopes: ExportScope[] = [{ kind: 'side', side: 'red' }, { kind: 'flights', flightKeys: ['red:3'] }, { kind: 'aircraft', aircraftType: 'MiG-29S' }];
    for (const scope of scopes) {
      const text = redHandout(scope);
      expect(text, scope.kind).toContain('RED TASK');
      expect(text, scope.kind).not.toContain('BLUE TASK');
      expect(text, scope.kind).not.toContain('SA-10');
    }
  });

  it('keeps the displayed side for the whole mission and for a mixed selection', () => {
    expect(redHandout({ kind: 'mission' })).toContain('SA-10');
    const flights = fixtureMission();
    const all = [
      { key: 'blue:1', side: 'blue' as const, flight: flights.coalitions.blue.flights[0] },
      { key: 'red:3', side: 'red' as const, flight: flights.coalitions.red.flights[0] },
    ];
    expect(resolveExportSide({ kind: 'flights', flightKeys: ['blue:1', 'red:3'] }, all, 'blue')).toBe('blue');
    expect(resolveExportSide({ kind: 'flights', flightKeys: ['red:3'] }, all.slice(1), 'blue')).toBe('red');
  });
});

describe('a stored aircraft type the view does not have (PE-9)', () => {
  it('is read as the first type of the view, the one the select shows', () => {
    expect(effectiveExportScope({ kind: 'aircraft', aircraftType: 'Su-27' }, 'pilot', 'blue', ['F-16C_50', 'FA-18C_hornet']))
      .toEqual({ kind: 'aircraft', aircraftType: 'F-16C_50' });
    const known = { kind: 'aircraft' as const, aircraftType: 'FA-18C_hornet' };
    expect(effectiveExportScope(known, 'pilot', 'blue', ['F-16C_50', 'FA-18C_hornet'])).toBe(known);
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
