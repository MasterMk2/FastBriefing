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

/**
 * Who an issue is for. This table is the one place that decides it, for the overview screen and for every
 * output (print, PNG, Markdown):
 * - `notice`: a load notice the pilot needs (the map, the clock, the bearings, the reading of the file).
 * - `defaulted`: a value the pilot sees was filled in or left out (QNH, temperature, clouds, an airbase name,
 *   a position). The pilot is told, in the "既定値を使った項目" list and in the handout.
 * - `creatorOnly`: data quality and tool notes the pilot cannot act on (an unknown CLSID or unit type) and the
 *   threat data (SPEC 5.1, D1). Pilot view lists them neither on screen nor in the output.
 */
export type IssueAudience = 'notice' | 'defaulted' | 'creatorOnly';

export const ISSUE_AUDIENCE: Readonly<Record<IssueCode, IssueAudience>> = {
  'threat.rangeUnrecorded': 'creatorOnly',
  'unit.unknownType': 'creatorOnly',
  'weapon.unknownClsid': 'creatorOnly',
  // An unknown preset leaves the cloud line with a fallback label, which the pilot reads.
  'weather.cloudPresetUnknown': 'defaulted',
  'weather.qnhDefaulted': 'defaulted',
  'weather.temperatureDefaulted': 'defaulted',
  'airbase.nameMissing': 'defaulted',
  'map.unsupported': 'notice',
  'time.utcOffsetUnknown': 'notice',
  'magvar.unsupported': 'notice',
  'parse.unknownNode': 'notice',
  'coord.unresolved': 'defaulted',
};

/** Creator-only codes (data quality, tool notes and threats): pilot view lists them nowhere (D1). */
export function isCreatorOnlyIssueCode(code: string): boolean {
  return ISSUE_AUDIENCE[code as IssueCode] === 'creatorOnly' || code.startsWith('threat.');
}

/** Weather values filled with defaults: listed with the defaults, not as load notices, although they are warnings. */
export const DEFAULTED_ISSUE_CODES: ReadonlySet<IssueCode> = new Set<IssueCode>(['weather.qnhDefaulted', 'weather.temperatureDefaulted']);

/** Whether the view shows the issue at all: pilot view drops the creator-only codes (D1). */
export function isIssueShownInView(issue: MissionIssue, viewMode: ViewMode): boolean {
  return !(viewMode === 'pilot' && isCreatorOnlyIssueCode(issue.code));
}

/**
 * Whether the issue is a load notice of the view (the overview's "読み込みの注意"): a warning or an error the view
 * shows, other than a defaulted value. Every other issue the view shows goes in the defaults list.
 */
export function isLoadNoticeIssue(issue: MissionIssue, viewMode: ViewMode): boolean {
  return issue.severity !== 'info' && ISSUE_AUDIENCE[issue.code] !== 'defaulted' && isIssueShownInView(issue, viewMode);
}

/** Whether the issue goes in the defaults list of the view ("既定値を使った項目"): shown, and not a load notice. */
export function isDefaultsListIssue(issue: MissionIssue, viewMode: ViewMode): boolean {
  return isIssueShownInView(issue, viewMode) && !isLoadNoticeIssue(issue, viewMode);
}

/** Whether the mission has an issue of the code, for example to mark a QNH filled with the default value. */
export function hasIssue(issues: readonly MissionIssue[], code: IssueCode): boolean {
  return issues.some(issue => issue.code === code);
}

/** One line of an issue list, before translation. `side` is the coalition mark to show, or null for none. */
export interface IssueEntry {
  /** Stable and independent of the language: code, side mark and sorted params. */
  key: string;
  issue: MissionIssue;
  side: 'blue' | 'red' | null;
}

const SEVERITY_RANK: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };

/**
 * The lines of an issue list, without duplicates. The overview screen and the handouts both call this, so they
 * list the same lines with the same side marks. Two issues are one line when their code and params are the same:
 * an issue without a coalition (or a neutral one) takes in the copies of the coalitions, and is shown without a
 * mark; copies of blue and red without such an issue stay one line per coalition, each with its mark.
 */
export function issueEntries(issues: readonly MissionIssue[]): IssueEntry[] {
  const groups = new Map<string, { issue: MissionIssue; whole: boolean; sides: Array<'blue' | 'red'> }>();
  for (const issue of issues) {
    const identity = issueKey({ ...issue, side: undefined });
    const side = issue.side === 'blue' || issue.side === 'red' ? issue.side : null;
    const group = groups.get(identity) ?? { issue, whole: false, sides: [] };
    if (side === null) group.whole = true;
    else if (!group.sides.includes(side)) group.sides.push(side);
    groups.set(identity, group);
  }
  return [...groups.entries()].flatMap(([identity, group]) => {
    const sides: Array<'blue' | 'red' | null> = group.whole ? [null] : group.sides;
    return sides.map(side => ({ key: `${identity}|${side ?? ''}`, issue: group.issue, side }));
  });
}

/** The load notices of the view ("読み込みの注意"), errors first, then warnings, each in the order they came. */
export function loadNoticeEntries(issues: readonly MissionIssue[], viewMode: ViewMode): IssueEntry[] {
  return issueEntries(issues.filter(issue => isLoadNoticeIssue(issue, viewMode)))
    .sort((a, b) => SEVERITY_RANK[a.issue.severity] - SEVERITY_RANK[b.issue.severity]);
}

/** The defaults list of the view ("既定値を使った項目"), in the order they came. */
export function defaultsListEntries(issues: readonly MissionIssue[], viewMode: ViewMode): IssueEntry[] {
  return issueEntries(issues.filter(issue => isDefaultsListIssue(issue, viewMode)));
}

/**
 * The issue lists of a handout. The pilot handout lists what the pilot overview lists: its load notices as the
 * warnings, and its defaults list as the defaulted items. The creator handout lists every issue as warnings (the
 * creator overview's two lists together), for the author to fix before distributing.
 */
export function handoutIssueEntries(
  issues: readonly MissionIssue[],
  viewMode: ViewMode,
): { warnings: IssueEntry[]; defaulted: IssueEntry[] } {
  const notices = loadNoticeEntries(issues, viewMode);
  const defaults = defaultsListEntries(issues, viewMode);
  return viewMode === 'pilot' ? { warnings: notices, defaulted: defaults } : { warnings: [...notices, ...defaults], defaulted: [] };
}
