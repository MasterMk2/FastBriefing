// Pre-distribution checks (SPEC 5.1 F5, rules L1 to L10). Owner: P5.
// Contract (frozen): named export lintMission(mission) returns findings sorted error, warning, info.
// Callers pass the mission as displayed (`useMission().view`), so pilot view never checks the opposing side (D1).
// The rules that depend on the displayed side (L10) or the view mode (threat findings, D1) need them too:
// the overview must call lintMissionForSide(view, side, viewMode) with `useMission().side` and
// `useMission().viewMode`. lintMission(mission) has no side, so it falls back to the side that the data
// suggests (ownSideOf) and returns creator-view findings; do not use it for the displayed mission.
// Message texts live in the `lint` namespace under the flat keys `lint:L1` to `lint:L10`; the `params`
// names match the interpolation names in those texts.
import type { Airbase, DisplaySettings, Flight, MissionData, RoutePoint, Side, SupportAsset } from '../types/mission';
import type { LintFinding } from '../types/lint';
import { flightKey } from '../utils/flightKey';
import { defaultSide } from '../utils/viewMode';
import { conflictAnchor, conflictSide, detectMainFrequencyConflicts } from './frequencyConflicts';
import { isPositionResolved, type PositionLike } from './position';

const SIDES: readonly Side[] = ['blue', 'red'];
const SEVERITY_RANK: Readonly<Record<LintFinding['severity'], number>> = { error: 0, warning: 1, info: 2 };

interface LintRule {
  code: string;
  /** Threat rules. They do not run in pilot view (D1, SPEC 5.1). */
  creatorOnly: boolean;
  run: (mission: MissionData, side: Side) => LintFinding[];
}

/**
 * Every rule, in order (L1 to L10). This table is the one place that says which rules pilot view leaves out:
 * the findings, the overview's rule count and lintRuleCodesFor all read it.
 */
const LINT_RULES: readonly LintRule[] = [
  { code: 'L1', creatorOnly: false, run: ruleFrequencyOverlap },
  { code: 'L2', creatorOnly: false, run: ruleDuplicateCallsign },
  { code: 'L3', creatorOnly: false, run: ruleTankerTacan },
  { code: 'L4', creatorOnly: false, run: ruleDuplicateTacan },
  { code: 'L5', creatorOnly: false, run: ruleAirbaseOwner },
  { code: 'L6', creatorOnly: false, run: ruleEtaMismatch },
  { code: 'L7', creatorOnly: false, run: ruleUnresolvedPositions },
  { code: 'L8', creatorOnly: true, run: ruleUnrecordedThreats },
  { code: 'L9', creatorOnly: false, run: ruleLaserCode },
  { code: 'L10', creatorOnly: false, run: ruleClientCount },
];

/** Codes of all rules, L1 to L10. */
export const LINT_RULE_CODES: readonly string[] = LINT_RULES.map(rule => rule.code);

function rulesFor(viewMode: DisplaySettings['viewMode']): readonly LintRule[] {
  return LINT_RULES.filter(rule => viewMode === 'creator' || !rule.creatorOnly);
}

/** Whether a rule is a threat rule (creator view only, D1). The overview hides the same findings with it. */
export function isCreatorOnlyLintRule(code: string): boolean {
  return LINT_RULES.some(rule => rule.code === code && rule.creatorOnly);
}

/** The codes of the rules the check runs for a view. Pilot view leaves out the threat rules (D1). */
export function lintRuleCodesFor(viewMode: DisplaySettings['viewMode']): string[] {
  return rulesFor(viewMode).map(rule => rule.code);
}

/** How many rules the check runs for a view (the overview shows this count). */
export function checkedLintRuleCount(viewMode: DisplaySettings['viewMode']): number {
  return rulesFor(viewMode).length;
}

/** L6: the ETA tolerance is at least 30 s, or 10% of the ETA difference when that is larger. */
const ETA_TOLERANCE_MIN_SECONDS = 30;
const ETA_TOLERANCE_RATIO = 0.1;

const LASER_CODE_PATTERN = /^\d{4}$/;

interface SupportRef {
  side: Side;
  index: number;
  asset: SupportAsset;
}

/**
 * All rules for the displayed side inferred from the data (see ownSideOf). Prefer
 * lintMissionForSide when the displayed side is known.
 */
export function lintMission(mission: MissionData): LintFinding[] {
  return lintMissionForSide(mission, ownSideOf(mission));
}

/**
 * All rules, with L10 checked for the displayed side (`useMission().side`) and the findings
 * filtered for the displayed view mode. In pilot view no threat finding is returned, because the
 * threats screen is empty there (SPEC 5.1, D1).
 */
export function lintMissionForSide(
  mission: MissionData,
  side: Side,
  viewMode: DisplaySettings['viewMode'] = 'creator',
): LintFinding[] {
  const findings = rulesFor(viewMode).flatMap(rule => rule.run(mission, side));
  return sortFindings(findings);
}

/**
 * The side used when the caller does not give one (L10 through lintMission only).
 * The side that has flights when only one side has them, or the D2 default when
 * both or neither have flights. Callers that know the displayed side must pass it
 * with lintMissionForSide instead.
 */
export function ownSideOf(mission: MissionData): Side {
  const blue = mission.coalitions.blue.flights.length;
  const red = mission.coalitions.red.flights.length;
  if (blue > 0 && red === 0) return 'blue';
  if (red > 0 && blue === 0) return 'red';
  return defaultSide(mission);
}

/**
 * L1: the main frequency (flight group frequency or support frequency) of two or more different flights
 * or support assets, within 1 kHz with the same modulation. Radio presets do not count (Lead decision 1).
 * One finding per frequency; the comms screen lists the same conflicts with the same anchor.
 */
function ruleFrequencyOverlap(mission: MissionData): LintFinding[] {
  return detectMainFrequencyConflicts(mission).map((conflict): LintFinding => ({
    id: `L1:${conflictAnchor(conflict)}`,
    code: 'L1',
    severity: 'warning',
    side: conflictSide(conflict),
    screen: 'comms',
    anchor: conflictAnchor(conflict),
    params: {
      frequency: conflict.frequencyMHz.toFixed(3),
      modulation: conflict.modulation,
      count: conflict.users.length,
    },
  }));
}

/** L2: two flights of one coalition with the same callsign (case and surrounding spaces ignored). */
function ruleDuplicateCallsign(mission: MissionData): LintFinding[] {
  return SIDES.flatMap(side => {
    const groups = new Map<string, Flight[]>();
    for (const flight of mission.coalitions[side].flights) {
      const key = normalizeCallsign(flight.callsign);
      if (!key) continue;
      groups.set(key, [...(groups.get(key) ?? []), flight]);
    }
    return [...groups.entries()]
      .filter(([, flights]) => flights.length > 1)
      .map(([key, flights]): LintFinding => ({
        id: `L2:${side}:${key}`,
        code: 'L2',
        severity: 'error',
        side,
        screen: 'flights',
        flightKey: flightKey(side, flights[0].groupId),
        params: { callsign: flights[0].callsign.trim(), count: flights.length },
      }));
  });
}

/** L3: a tanker without a TACAN beacon. */
function ruleTankerTacan(mission: MissionData): LintFinding[] {
  return supportRefs(mission)
    .filter(ref => ref.asset.kind === 'tanker' && !ref.asset.tacan)
    .map((ref): LintFinding => ({
      id: `L3:${supportAnchor(ref)}`,
      code: 'L3',
      severity: 'warning',
      side: ref.side,
      screen: 'support',
      anchor: supportAnchor(ref),
      params: { callsign: ref.asset.callsign },
    }));
}

/** L4: two or more support assets with the same TACAN channel and mode. Mixed coalitions are reported as neutral. */
function ruleDuplicateTacan(mission: MissionData): LintFinding[] {
  const groups = new Map<string, SupportRef[]>();
  for (const ref of supportRefs(mission)) {
    const tacan = ref.asset.tacan;
    if (!tacan) continue;
    const channel = String(tacan.channel ?? '').trim();
    if (!channel) continue;
    const key = `${channel}|${tacan.mode}`;
    groups.set(key, [...(groups.get(key) ?? []), ref]);
  }

  return [...groups.entries()]
    .filter(([, refs]) => refs.length >= 2)
    .map(([key, refs]): LintFinding => {
      const sides = new Set(refs.map(ref => ref.side));
      const first = refs[0];
      return {
        id: `L4:${key}`,
        code: 'L4',
        severity: 'warning',
        side: sides.size === 1 ? first.side : 'neutral',
        screen: 'support',
        anchor: supportAnchor(first),
        params: {
          channel: String(first.asset.tacan?.channel ?? ''),
          mode: first.asset.tacan?.mode ?? '',
          count: refs.length,
        },
      };
    });
}

/**
 * L5: a route point that uses an airbase owned by neither the flight's own
 * coalition nor NEUTRAL. In pilot view the opposing airbases are removed, so
 * this rule only sees them in creator view.
 */
function ruleAirbaseOwner(mission: MissionData): LintFinding[] {
  const airbases = new Map<number, Airbase>();
  for (const side of ['blue', 'red', 'neutral'] as const) {
    for (const airbase of mission.coalitions[side].airbases) {
      if (!airbases.has(airbase.id)) airbases.set(airbase.id, airbase);
    }
  }

  const findings: LintFinding[] = [];
  for (const side of SIDES) {
    for (const flight of mission.coalitions[side].flights) {
      const key = flightKey(side, flight.groupId);
      for (const point of flight.route) {
        if (point.airdromeId === undefined) continue;
        const airbase = airbases.get(point.airdromeId);
        if (!airbase) continue;
        const owner = airbase.owner.toUpperCase();
        if (owner === side.toUpperCase() || owner === 'NEUTRAL') continue;
        findings.push({
          id: `L5:${key}:${point.index}`,
          code: 'L5',
          severity: 'warning',
          side,
          screen: 'flights',
          flightKey: key,
          anchor: routeAnchor(key, point.index),
          params: { airbase: airbase.name || String(airbase.id), owner },
        });
      }
    }
  }
  return findings;
}

/** L6: the ETA difference between two route points disagrees with distance divided by speed. Info only. */
function ruleEtaMismatch(mission: MissionData): LintFinding[] {
  return SIDES.flatMap(side => mission.coalitions[side].flights.flatMap((flight): LintFinding[] => {
    const mismatched = etaMismatchPoints(flight.route);
    if (mismatched.length === 0) return [];
    const key = flightKey(side, flight.groupId);
    return [{
      id: `L6:${key}`,
      code: 'L6',
      severity: 'info',
      side,
      screen: 'flights',
      flightKey: key,
      anchor: routeAnchor(key, mismatched[0].index),
      params: { count: mismatched.length, point: mismatched[0].index },
    }];
  }));
}

/**
 * Route points whose leg does not match its ETA. A leg is skipped when the
 * ETA does not increase (ETA not set) or the speed is not positive, because
 * nothing can be compared then.
 */
export function etaMismatchPoints(route: RoutePoint[]): RoutePoint[] {
  const result: RoutePoint[] = [];
  for (let i = 1; i < route.length; i += 1) {
    const previous = route[i - 1];
    const current = route[i];
    if (!Number.isFinite(previous.eta) || !Number.isFinite(current.eta)) continue;
    const etaDifference = current.eta - previous.eta;
    if (etaDifference <= 0) continue;
    if (!(current.speed > 0)) continue;

    const distance = Math.hypot(current.xy[0] - previous.xy[0], current.xy[1] - previous.xy[1]);
    const computedSeconds = distance / current.speed;
    const tolerance = Math.max(ETA_TOLERANCE_MIN_SECONDS, ETA_TOLERANCE_RATIO * etaDifference);
    if (Math.abs(etaDifference - computedSeconds) > tolerance) result.push(current);
  }
  return result;
}

/**
 * isPositionResolved as a plain boolean. Used in filter callbacks: a type predicate inferred from
 * `!isPositionResolved(x)` would narrow x to never, and the following map would fail to type-check.
 */
function isUnresolved(entity: PositionLike): boolean {
  return !isPositionResolved(entity);
}

/**
 * L7: positions that could not be resolved to a map coordinate, counted per coalition and per kind.
 * Uses the same check as the support and threat screens (isPositionResolved), so a position the
 * screen shows as unresolved is counted here too. Each finding anchors at its first unresolved
 * position: the route point of the first such flight (with its flightKey), or the first such support asset.
 */
function ruleUnresolvedPositions(mission: MissionData): LintFinding[] {
  return SIDES.flatMap((side): LintFinding[] => {
    const coalition = mission.coalitions[side];
    const unresolvedRoutes = coalition.flights.flatMap(flight => flight.route
      .filter(point => isUnresolved(point))
      .map(point => ({ flight, point })));
    const unresolvedSupport = coalition.support
      .map((asset, index) => ({ asset, index }))
      .filter(item => isUnresolved(item.asset));
    const findings: LintFinding[] = [];
    if (unresolvedRoutes.length > 0) {
      const first = unresolvedRoutes[0];
      const key = flightKey(side, first.flight.groupId);
      findings.push({
        id: `L7:route:${side}`,
        code: 'L7',
        severity: 'info',
        side,
        screen: 'flights',
        flightKey: key,
        anchor: routeAnchor(key, first.point.index),
        params: { count: unresolvedRoutes.length },
      });
    }
    if (unresolvedSupport.length > 0) {
      const first = unresolvedSupport[0];
      findings.push({
        id: `L7:support:${side}`,
        code: 'L7',
        severity: 'info',
        side,
        screen: 'support',
        anchor: `support:${side}:${first.index}`,
        params: { count: unresolvedSupport.length },
      });
    }
    return findings;
  });
}

/**
 * L8: ground or naval groups with no recorded threat range (threatRangeSource 'unknown'). Counts only, no
 * positions. The anchor is the first such group: threats:<side>:<index in the coalition's aiGroups>.
 */
function ruleUnrecordedThreats(mission: MissionData): LintFinding[] {
  return SIDES.flatMap((side): LintFinding[] => {
    const groups = mission.coalitions[side].aiGroups;
    const count = groups.filter(group => group.threatRangeSource === 'unknown').length;
    if (count === 0) return [];
    const firstIndex = groups.findIndex(group => group.threatRangeSource === 'unknown');
    return [{
      id: `L8:${side}`,
      code: 'L8',
      severity: 'info',
      side,
      screen: 'threats',
      anchor: `threats:${side}:${firstIndex}`,
      params: { count },
    }];
  });
}

/** L9: a laser code that is not four digits (support laser code and JTAC laser code). */
function ruleLaserCode(mission: MissionData): LintFinding[] {
  return supportRefs(mission).flatMap((ref): LintFinding[] => {
    const codes = [ref.asset.laserCode, ref.asset.jtac?.laserCode].flatMap(value =>
      value === undefined || value === null || String(value).trim() === '' ? [] : [String(value).trim()],
    );
    const invalid = codes.find(code => !LASER_CODE_PATTERN.test(code));
    if (invalid === undefined) return [];
    return [{
      id: `L9:${supportAnchor(ref)}`,
      code: 'L9',
      severity: 'warning',
      side: ref.side,
      screen: 'support',
      anchor: supportAnchor(ref),
      params: { callsign: ref.asset.callsign, code: invalid },
    }];
  });
}

/**
 * L10: the displayed side has no Client flight. The jump opens the side's first flight when there is one.
 */
function ruleClientCount(mission: MissionData, own: Side): LintFinding[] {
  const flights = mission.coalitions[own].flights;
  if (flights.some(hasClientUnit)) return [];
  const first = flights[0];
  return [{
    id: `L10:${own}`,
    code: 'L10',
    severity: 'error',
    side: own,
    screen: 'flights',
    ...(first ? { flightKey: flightKey(own, first.groupId) } : {}),
    params: {},
  }];
}

function supportRefs(mission: MissionData): SupportRef[] {
  return SIDES.flatMap(side => mission.coalitions[side].support.map((asset, index) => ({ side, index, asset })));
}

function supportAnchor(ref: SupportRef): string {
  return `support:${ref.side}:${ref.index}`;
}

function routeAnchor(key: string, pointIndex: number): string {
  return `route:${key}:${pointIndex}`;
}

function normalizeCallsign(callsign: string): string {
  return callsign.trim().toLowerCase();
}

function hasClientUnit(flight: Flight): boolean {
  return (flight.units ?? []).some(unit => {
    const skill = (unit.skill ?? '').toLowerCase();
    return skill === 'client' || skill === 'player';
  });
}

function sortFindings(findings: LintFinding[]): LintFinding[] {
  return [...findings].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
