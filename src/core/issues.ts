import type { IssueCode, IssueSeverity, IssueSide, MissionIssue } from '../types/mission';

/** Severity is fixed per code so that every producer reports the same level. */
export const ISSUE_SEVERITY: Readonly<Record<IssueCode, IssueSeverity>> = {
  'threat.rangeUnrecorded': 'info',
  'unit.unknownType': 'info',
  'weapon.unknownClsid': 'info',
  'weather.cloudPresetUnknown': 'info',
  'weather.qnhDefaulted': 'warning',
  'weather.temperatureDefaulted': 'warning',
  'airbase.nameMissing': 'info',
  'map.unsupported': 'warning',
  'time.utcOffsetUnknown': 'warning',
  'magvar.unsupported': 'warning',
  'parse.unknownNode': 'warning',
  'coord.unresolved': 'info',
};

export function createIssue(code: IssueCode, params?: Record<string, string | number>, side?: IssueSide): MissionIssue {
  const severity = ISSUE_SEVERITY[code];
  const issue: MissionIssue = { code, severity };
  if (params) issue.params = { ...params };
  if (side) issue.side = side;
  return issue;
}

/**
 * Identity used for de-duplication: the code, the side and the sorted parameters.
 * The side is part of the identity so that the same unknown type reported for two
 * coalitions stays as two issues, and pilot view can drop the other side's copy (D1).
 */
export function issueKey(issue: MissionIssue): string {
  const params = issue.params
    ? Object.keys(issue.params).sort().map(name => `${name}=${String(issue.params?.[name])}`).join('&')
    : '';
  return `${issue.code}|${issue.side ?? ''}|${params}`;
}

/** Append an issue unless an identical one (same code, side and params) is already present. */
export function addIssue(issues: MissionIssue[], code: IssueCode, params?: Record<string, string | number>, side?: IssueSide): void {
  const issue = createIssue(code, params, side);
  const key = issueKey(issue);
  if (!issues.some(existing => issueKey(existing) === key)) issues.push(issue);
}
