import type { DisplaySettings, ParsedMissionFile } from '../types/mission';

export type RevisionValue = string | number | boolean | null | RevisionValue[] | { [key: string]: RevisionValue };
type RecordValue = Record<string, unknown>;
export type RevisionCategory = 'mission' | 'route' | 'loadout' | 'radio' | 'weather';
export interface RevisionPoint { index: number; name: string; data: Record<string, RevisionValue> }
interface RevisionUnit { id?: string; name: string; loadout: RevisionValue; radio: RevisionValue }
export interface RevisionFlight {
  id?: string;
  name: string;
  side: string;
  category: string;
  hidden: boolean;
  route: RevisionPoint[];
  units: RevisionUnit[];
  radio: RevisionValue;
}
export interface MissionRevision {
  theatre: string;
  startTime?: RevisionValue;
  date?: RevisionValue;
  weather?: RevisionValue;
  flights: RevisionFlight[];
}
export interface RevisionChange {
  category: RevisionCategory;
  entity: string;
  field: string;
  before?: RevisionValue;
  after?: RevisionValue;
  kind: 'added' | 'removed' | 'changed';
}
export interface RevisionRoute {
  name: string;
  before: RevisionPoint[];
  after: RevisionPoint[];
}
export interface MissionRevisionDiff { changes: RevisionChange[]; routes: RevisionRoute[]; sameTheatre: boolean }

function record(value: unknown): RecordValue {
  return value !== null && typeof value === 'object' ? value as RecordValue : {};
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function numeric(value: unknown): unknown {
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : value;
}
function id(value: unknown): string | undefined {
  const number = numeric(value);
  return typeof number === 'number' && Number.isInteger(number) && number > 0 ? String(number) : undefined;
}
function entries(value: unknown): [string, unknown][] {
  if (Array.isArray(value)) return value.map((item, index) => [String(index + 1), item]);
  return Object.entries(record(value)).filter(([key]) => /^\d+$/.test(key)).sort(([a], [b]) => Number(a) - Number(b));
}
function collection(value: unknown): unknown[] {
  const items = entries(value);
  return items.length ? items.map(([, item]) => item) : Object.keys(record(value)).length ? [value] : [];
}
/** Lua arrays and numeric-key tables have the same canonical representation. */
function canonical(value: unknown, numbers = false): RevisionValue | undefined {
  if (numbers) value = numeric(value);
  if (value === undefined) return undefined;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  const items = Array.isArray(value) ? entries(value) : Object.entries(record(value));
  return Object.fromEntries(items.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .flatMap(([key, child]) => {
      const result = canonical(child, numbers);
      return result === undefined ? [] : [[key, result]];
    }));
}
function pick(source: RecordValue, fields: string[], numbers = false): Record<string, RevisionValue> {
  return Object.fromEntries(fields.flatMap(key => {
    const value = canonical(source[key], numbers);
    return value === undefined ? [] : [[key, value]];
  }));
}
function frequency(value: unknown): RevisionValue | undefined {
  const number = numeric(value);
  return typeof number === 'number' && Number.isFinite(number)
    ? Math.abs(number) >= 1000 ? number / 1e6 : number : canonical(value);
}
function resolveName(value: unknown, dictionary: Record<string, string>): string {
  const name = text(value);
  return Object.prototype.hasOwnProperty.call(dictionary, name) ? dictionary[name] : name;
}

/** Compare source values, before display defaults erase missing-vs-zero differences. */
export function createMissionRevision(parsed: Pick<ParsedMissionFile, 'mission' | 'theatre' | 'dictionary'>): MissionRevision {
  const mission = record(parsed.mission);
  const flights: RevisionFlight[] = [];
  for (const side of ['blue', 'red', 'neutral']) {
    const coalition = record(mission.coalition);
    const countries = collection(record(side === 'neutral' ? coalition.neutrals ?? coalition.neutral : coalition[side]).country);
    for (const country of countries) for (const category of ['plane', 'helicopter']) {
      const categoryData = record(country)[category];
      const groups = collection(categoryData).flatMap(item =>
        record(item).group !== undefined ? collection(record(item).group) : [item]);
      for (const group of groups) {
        const source = record(group);
        const units = entries(source.units).map(([, item]) => {
          const unit = record(item);
          const payload = record(unit.payload);
          const loadout = {
            ...pick(payload, ['fuel', 'chaff', 'flare', 'gun'], true),
            ...(payload.pylons !== undefined ? { pylons: canonical(payload.pylons)! } : {}),
          };
          return {
            id: id(unit.unitId), name: resolveName(unit.name, parsed.dictionary),
            loadout: unit.payload === undefined ? null : loadout,
            // Include bank + channel identity; presets in different banks are distinct.
            radio: sourceRadios(unit),
          };
        });
        flights.push({
          id: id(source.groupId), name: resolveName(source.name, parsed.dictionary), side, category,
          hidden: source.hidden === true,
          radio: { ...pick(source, ['modulation', 'communication'], true),
            ...(source.frequency !== undefined ? { frequency: frequency(source.frequency)! } : {}) },
          route: entries(record(source.route).points).map(([key, item]) => {
            const point = record(item);
            return { index: Number(key), name: resolveName(point.name, parsed.dictionary), data: {
              ...pick(point, ['x', 'y', 'alt', 'speed', 'ETA', 'airdromeId', 'helipadId', 'linkUnit'], true),
              ...pick(point, ['action', 'type', 'alt_type', 'ETA_locked', 'speed_locked', 'task']),
              ...(point.name !== undefined ? { name: resolveName(point.name, parsed.dictionary) } : {}),
            } };
          }),
          units,
        });
      }
    }
  }
  return { theatre: parsed.theatre, startTime: canonical(mission.start_time, true),
    date: canonical(mission.date, true), weather: canonical(mission.weather, true), flights };
}
function sourceRadios(unit: RecordValue): RevisionValue {
  const source = unit.Radio ?? unit.radioSet;
  if (source === undefined) return null;
  const banks = record(source).channels !== undefined ? [['1', source] as [string, unknown]] : entries(source);
  return Object.fromEntries(banks.flatMap(([bankId, value]) => {
    const bank = record(value);
    const modulations = new Map(entries(bank.modulations));
    const names = new Map(entries(bank.channelsNames));
    return entries(bank.channels).map(([channel, value]) => {
      const embedded = typeof value === 'object' && value !== null;
      const source = embedded ? record(value) : { frequency: value };
      return [`${bankId}:${channel}`, {
        ...pick({ modulation: source.modulation ?? modulations.get(channel) }, ['modulation'], true),
        ...pick({ name: source.name ?? names.get(channel) }, ['name']),
        ...(source.frequency !== undefined ? { frequency: frequency(source.frequency)! } : {}),
      }];
    });
  }));
}
function equal(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }

/** Never overwrite a duplicate ID or guess that two ambiguous entities are identical. */
function match<T>(before: T[], after: T[], keys: Array<(item: T) => string | undefined>): Array<[T | undefined, T | undefined]> {
  const unmatchedBefore = new Set(before);
  const unmatchedAfter = new Set(after);
  const pairs: Array<[T | undefined, T | undefined]> = [];
  for (const key of keys) {
    const index = (items: Set<T>) => {
      const result = new Map<string, T[]>();
      for (const item of items) {
        const k = key(item);
        if (k) { const values = result.get(k) ?? []; values.push(item); result.set(k, values); }
      }
      return result;
    };
    const left = index(unmatchedBefore), right = index(unmatchedAfter);
    for (const [k, values] of left) {
      const candidates = right.get(k);
      if (values.length !== 1 || candidates?.length !== 1) continue;
      pairs.push([values[0], candidates[0]]);
      unmatchedBefore.delete(values[0]); unmatchedAfter.delete(candidates[0]);
    }
  }
  return [...pairs, ...[...unmatchedBefore].map(item => [item, undefined] as [T, undefined]),
    ...[...unmatchedAfter].map(item => [undefined, item] as [undefined, T])];
}
function pointPairs(before: RevisionPoint[], after: RevisionPoint[]) {
  const pairs = match(before, after, [point => point.name || undefined, point => JSON.stringify(point.data)]);
  const anchored = pairs.filter(([a, b]) => a && b);
  const left = pairs.filter(([a, b]) => a && !b).map(([a]) => a!);
  const right = pairs.filter(([a, b]) => !a && b).map(([, b]) => b!);
  // Only pair unnamed/renamed edits by order within equally sized gaps. Insertion
  // and deletion must not shift every following waypoint into a false movement.
  const anchors = ([0, 1] as const).map(side => anchored.map(pair => ({
    index: pair[side]!.index, identity: pair[0]!.index,
  })).sort((a, b) => a.index - b.index));
  const gap = (point: RevisionPoint, side: 0 | 1) => {
    const items = anchors[side];
    let low = 0, high = items.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (items[mid].index < point.index) low = mid + 1; else high = mid;
    }
    return `${items[low - 1]?.identity ?? 'start'}:${items[low]?.identity ?? 'end'}`;
  };
  const buckets = new Map<string, [RevisionPoint[], RevisionPoint[]]>();
  ([left, right] as const).forEach((points, side) => points.forEach(point => {
    const key = gap(point, side as 0 | 1);
    const pair = buckets.get(key) ?? [[], []]; pair[side].push(point); buckets.set(key, pair);
  }));
  for (const [a, b] of buckets.values()) {
    if (a.length === b.length) a.forEach((point, i) => anchored.push([point, b[i]]));
    else { a.forEach(point => anchored.push([point, undefined])); b.forEach(point => anchored.push([undefined, point])); }
  }
  return anchored;
}

export function compareMissionRevisions(before: MissionRevision, after: MissionRevision, viewMode: DisplaySettings['viewMode']): MissionRevisionDiff {
  const changes: RevisionChange[] = [];
  const routes: RevisionRoute[] = [];
  const diff = (category: RevisionCategory, entity: string, field: string, a?: RevisionValue, b?: RevisionValue) => {
    if (equal(a, b)) return;
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
        diff(category, entity, field ? `${field}.${key}` : key,
          (a as Record<string, RevisionValue>)[key], (b as Record<string, RevisionValue>)[key]);
      }
      return;
    }
    changes.push({ category, entity, field, before: a, after: b,
      kind: a === undefined ? 'added' : b === undefined ? 'removed' : 'changed' });
  };
  diff('mission', '', 'theatre', before.theatre, after.theatre);
  diff('mission', '', 'start_time', before.startTime, after.startTime);
  diff('mission', '', 'date', before.date, after.date);
  diff('weather', '', 'weather', before.weather, after.weather);
  const pairs = match(before.flights, after.flights, [
    f => f.id ? `${f.side}:${f.category}:${f.id}` : undefined,
    f => f.name ? `${f.side}:${f.category}:${f.name}` : undefined,
  ]);
  for (const [a, b] of pairs) {
    if (viewMode === 'pilot' && (a?.hidden || b?.hidden)) continue;
    const flight = b ?? a!;
    const label = `${flight.side} / ${flight.name || `#${flight.id ?? '?'}`}`;
    diff('mission', label, 'flight', a ? a.name : undefined, b ? b.name : undefined);
    diff('radio', label, 'group', a?.radio, b?.radio);
    const start = changes.length;
    const routePairs = pointPairs(a?.route ?? [], b?.route ?? []);
    for (const [oldPoint, newPoint] of routePairs) {
      const point = newPoint ?? oldPoint!;
      diff('route', label, `WP ${point.index}${point.name ? ` (${point.name})` : ''}`, oldPoint?.data, newPoint?.data);
    }
    // A reorder changes route semantics even when every point retains its fields.
    const matched = routePairs.filter(([x, y]) => x && y);
    const oldOrder = [...matched].sort(([x], [y]) => x!.index - y!.index).map(([x]) => x!.index);
    const newOrder = [...matched].sort(([, x], [, y]) => x!.index - y!.index).map(([x]) => x!.index);
    if (!equal(oldOrder, newOrder)) diff('route', label, 'order', oldOrder, newOrder);
    if (changes.length > start) routes.push({ name: label, before: a?.route ?? [], after: b?.route ?? [] });
    for (const [oldUnit, newUnit] of match(a?.units ?? [], b?.units ?? [], [u => u.id, u => u.name || undefined])) {
      const unit = newUnit ?? oldUnit!;
      const unitLabel = `${label} / ${unit.name || `#${unit.id ?? '?'}`}`;
      diff('loadout', unitLabel, 'payload', oldUnit?.loadout, newUnit?.loadout);
      diff('radio', unitLabel, 'presets (MHz)', oldUnit?.radio, newUnit?.radio);
    }
  }
  return { changes, routes, sameTheatre: before.theatre === after.theatre };
}
