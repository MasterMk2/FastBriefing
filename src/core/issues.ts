import type { DisplaySettings, IssueCode, IssueSeverity, IssueSide, MissionIssue } from '../types/mission';

type ViewMode = DisplaySettings['viewMode'];

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

/**
 * Append an issue unless an identical one (same code, side and params) is already present.
 * `hiddenSource` marks an issue that came from a hidden or late-activation group. An identical issue
 * from a visible group clears the mark, and a hidden copy never adds it to a visible one, so the
 * pilot view keeps every issue that a visible group reported (D1, G11).
 */
export function addIssue(
  issues: MissionIssue[],
  code: IssueCode,
  params?: Record<string, string | number>,
  side?: IssueSide,
  hiddenSource = false,
): void {
  const issue = createIssue(code, params, side);
  const key = issueKey(issue);
  const existing = issues.find(item => issueKey(item) === key);
  if (existing) {
    if (!hiddenSource) delete existing.hiddenSource;
    return;
  }
  if (hiddenSource) issue.hiddenSource = true;
  issues.push(issue);
}

/** Threat issues are creator-only (SPEC 5.1, D1): pilot view lists them neither on screen nor in the output. */
export function isCreatorOnlyIssueCode(code: string): boolean {
  return code.startsWith('threat.');
}

/** Weather values filled with defaults: the overview lists them with the defaults, not as load notices (SPEC 1.3). */
export const DEFAULTED_ISSUE_CODES: ReadonlySet<IssueCode> = new Set<IssueCode>(['weather.qnhDefaulted', 'weather.temperatureDefaulted']);

/** Whether the view shows the issue at all: pilot view drops the creator-only codes (D1). */
export function isIssueShownInView(issue: MissionIssue, viewMode: ViewMode): boolean {
  return !(viewMode === 'pilot' && isCreatorOnlyIssueCode(issue.code));
}

/**
 * Whether the issue is a load notice of the view (the overview's "読み込みの注意"): a warning or an error the view
 * shows. Info items (data-quality notes such as an unknown CLSID) and defaulted weather values are not: the
 * overview lists them with the defaults.
 */
export function isLoadNoticeIssue(issue: MissionIssue, viewMode: ViewMode): boolean {
  return issue.severity !== 'info' && !DEFAULTED_ISSUE_CODES.has(issue.code) && isIssueShownInView(issue, viewMode);
}

/** The load notices of the view, without duplicates (same code, side and params), in the order they came. */
export function loadNoticeIssues(issues: readonly MissionIssue[], viewMode: ViewMode): MissionIssue[] {
  return uniqueIssues(issues.filter(issue => isLoadNoticeIssue(issue, viewMode)));
}

/**
 * The warnings a handout lists (配布前の警告). The pilot handout lists exactly the load notices of the pilot
 * overview, so it says what the screen says: a data-quality note the pilot cannot act on stays off it. The creator
 * handout lists every issue, the data-quality notes included, for the author to fix before distributing.
 */
export function handoutWarningIssues(issues: readonly MissionIssue[], viewMode: ViewMode): MissionIssue[] {
  return viewMode === 'pilot' ? loadNoticeIssues(issues, viewMode) : uniqueIssues(issues);
}

function uniqueIssues(issues: readonly MissionIssue[]): MissionIssue[] {
  const seen = new Set<string>();
  return issues.filter(issue => {
    const key = issueKey(issue);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
