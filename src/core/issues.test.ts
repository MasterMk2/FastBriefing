import { describe, expect, it } from 'vitest';
import type { IssueCode, MissionIssue } from '../types/mission';
import {
  addIssue,
  createIssue,
  defaultsListEntries,
  handoutIssueEntries,
  isCreatorOnlyIssueCode,
  isDefaultsListIssue,
  isLoadNoticeIssue,
  ISSUE_SEVERITY,
  issueEntries,
  issueKey,
  loadNoticeEntries,
  type IssueEntry,
} from './issues';
import { normalizeMission } from './MissionNormalizer';

describe('mission issues', () => {
  it('takes the severity from the code, so every producer reports the same level', () => {
    expect(createIssue('threat.rangeUnrecorded', { type: 'X' })).toEqual({
      code: 'threat.rangeUnrecorded',
      severity: 'info',
      params: { type: 'X' },
    });
    expect(ISSUE_SEVERITY['map.unsupported']).toBe('warning');
  });

  it('keeps one issue per code and parameter set, and keeps different parameters apart', () => {
    const issues: MissionIssue[] = [];
    addIssue(issues, 'unit.unknownType', { type: 'A' });
    addIssue(issues, 'unit.unknownType', { type: 'A' });
    addIssue(issues, 'unit.unknownType', { type: 'B' });

    expect(issues.map(issue => issue.params?.type)).toEqual(['A', 'B']);
  });

  it('builds the same key regardless of the order of parameters', () => {
    const left = createIssue('weapon.unknownClsid', { clsid: '{1}' });
    const right = { code: 'weapon.unknownClsid' as const, severity: 'info' as const, params: { clsid: '{1}' } };
    expect(issueKey(left)).toBe(issueKey(right));
  });

  it('reports an unsupported map once as a coded issue, not as prose', () => {
    const parsed = {
      mission: { sortie: 'Issue fixture', start_time: 0, weather: {} },
      theatre: 'UnsupportedTestTheatre',
      warehouses: {},
      dictionary: {},
      mapResource: {},
    };
    const normalized = normalizeMission(parsed, { coordinateFormat: 'DDM', unitSystem: 'metric', viewMode: 'creator' });

    const mapIssues = normalized.issues.filter(issue => issue.code === 'map.unsupported');
    expect(mapIssues).toEqual([{ code: 'map.unsupported', severity: 'warning', params: { theatre: 'UnsupportedTestTheatre' } }]);
    expect(normalized.issues.every(issue => typeof issue.code === 'string' && !('message' in issue))).toBe(true);
  });

  it('reports a theatre without a magnetic variation table once as magvar.unsupported', () => {
    const normalized = normalizeMission({
      mission: { sortie: 'Issue fixture', start_time: 0, weather: {} },
      theatre: 'UnsupportedTestTheatre',
      warehouses: {},
      dictionary: {},
      mapResource: {},
    }, { coordinateFormat: 'DDM', unitSystem: 'metric', viewMode: 'creator' });

    const magvarIssues = normalized.issues.filter(issue => issue.code === 'magvar.unsupported');
    expect(magvarIssues).toEqual([{ code: 'magvar.unsupported', severity: 'warning', params: { theatre: 'UnsupportedTestTheatre' } }]);
  });

  it('carries parser issues into the normalized mission', () => {
    const normalized = normalizeMission({
      mission: { sortie: 'Issue fixture', start_time: 0, weather: {} },
      theatre: 'Caucasus',
      warehouses: {},
      dictionary: {},
      mapResource: {},
      parseIssues: [{ code: 'parse.unknownNode', severity: 'warning', params: { type: 'Vararg' } }],
    }, { coordinateFormat: 'DDM', unitSystem: 'metric', viewMode: 'creator' });

    expect(normalized.issues).toContainEqual({ code: 'parse.unknownNode', severity: 'warning', params: { type: 'Vararg' } });
  });

  it('lists the same warnings for the overview and the pilot handout, and every issue for the creator handout', () => {
    const issues: MissionIssue[] = [
      createIssue('time.utcOffsetUnknown', { theatre: 'Nowhere' }),
      createIssue('weapon.unknownClsid', { clsid: 'CATM-9M' }),
      createIssue('unit.unknownType', { type: 'X' }),
      createIssue('threat.rangeUnrecorded', { type: 'SA-X' }),
      createIssue('weather.qnhDefaulted'),
      createIssue('time.utcOffsetUnknown', { theatre: 'Nowhere' }),
    ];
    const codes = (entries: readonly IssueEntry[]) => entries.map(entry => entry.issue.code);
    // Warnings and errors only: info items and defaulted weather values are listed with the defaults (SPEC 1.3).
    expect(codes(loadNoticeEntries(issues, 'pilot'))).toEqual(['time.utcOffsetUnknown']);
    // The pilot is told about the defaulted QNH, but not about the data-quality notes (creator-only).
    expect(codes(defaultsListEntries(issues, 'pilot'))).toEqual(['weather.qnhDefaulted']);
    expect(handoutIssueEntries(issues, 'pilot')).toEqual({
      warnings: loadNoticeEntries(issues, 'pilot'),
      defaulted: defaultsListEntries(issues, 'pilot'),
    });
    expect(codes(defaultsListEntries(issues, 'creator'))).toEqual([
      'weapon.unknownClsid', 'unit.unknownType', 'threat.rangeUnrecorded', 'weather.qnhDefaulted',
    ]);
    expect(codes(handoutIssueEntries(issues, 'creator').warnings)).toEqual([
      'time.utcOffsetUnknown', 'weapon.unknownClsid', 'unit.unknownType', 'threat.rangeUnrecorded', 'weather.qnhDefaulted',
    ]);
    expect(handoutIssueEntries(issues, 'creator').defaulted).toEqual([]);
  });

  it('decides the audience of every code: the pilot sees the notices and the filled values, not the data-quality notes', () => {
    const pilotDefaults = (Object.keys(ISSUE_SEVERITY) as IssueCode[])
      .filter(code => isDefaultsListIssue(createIssue(code), 'pilot'));
    expect(pilotDefaults.sort()).toEqual([
      'airbase.nameMissing', 'coord.unresolved', 'weather.cloudPresetUnknown', 'weather.qnhDefaulted', 'weather.temperatureDefaulted',
    ]);
    for (const code of ['weapon.unknownClsid', 'unit.unknownType', 'threat.rangeUnrecorded'] as const) {
      expect(isCreatorOnlyIssueCode(code)).toBe(true);
      expect(isDefaultsListIssue(createIssue(code), 'pilot')).toBe(false);
      expect(isDefaultsListIssue(createIssue(code), 'creator')).toBe(true);
    }
  });

  it('merges an issue without a side with the same issue of a side, and keeps blue and red apart', () => {
    const entries = issueEntries([
      createIssue('parse.unknownNode', { type: 'A' }, 'blue'),
      createIssue('parse.unknownNode', { type: 'A' }),
      createIssue('parse.unknownNode', { type: 'B' }, 'blue'),
      createIssue('parse.unknownNode', { type: 'B' }, 'red'),
      createIssue('parse.unknownNode', { type: 'B' }, 'blue'),
    ]);
    expect(entries.map(entry => [entry.issue.params?.type, entry.side])).toEqual([['A', null], ['B', 'blue'], ['B', 'red']]);
    expect(new Set(entries.map(entry => entry.key)).size).toBe(entries.length);
  });

  it('keeps a creator-only warning off the pilot lists and on the creator list', () => {
    const issue = { code: 'threat.rangeUnrecorded' as const, severity: 'warning' as const, params: { type: 'SA-X' } };
    expect(isLoadNoticeIssue(issue, 'pilot')).toBe(false);
    expect(isLoadNoticeIssue(issue, 'creator')).toBe(true);
  });

  it('reports a defaulted QNH and temperature only when the mission omits them', () => {
    const normalize = (weather: Record<string, unknown>) => normalizeMission({
      mission: { sortie: 'Issue fixture', start_time: 0, weather },
      theatre: 'Caucasus',
      warehouses: {},
      dictionary: {},
      mapResource: {},
    }, { coordinateFormat: 'DDM', unitSystem: 'metric', viewMode: 'creator' }).issues.map(issue => issue.code);

    expect(normalize({})).toEqual(expect.arrayContaining(['weather.qnhDefaulted', 'weather.temperatureDefaulted']));
    const complete = normalize({ qnh: 755, season: { temperature: 12 } });
    expect(complete).not.toContain('weather.qnhDefaulted');
    expect(complete).not.toContain('weather.temperatureDefaulted');
  });
});
