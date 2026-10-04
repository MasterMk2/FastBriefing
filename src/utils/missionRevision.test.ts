import { describe, expect, it } from 'vitest';
import { compareMissionRevisions, createMissionRevision } from './missionRevision';

function snapshot(groups: unknown[], weather: unknown = { qnh: 760 }, extra = {}) {
  return createMissionRevision({ theatre: 'Caucasus', dictionary: {}, mission: {
    start_time: 36000, weather, ...extra, coalition: { blue: { country: [{ plane: { group: groups } }] } },
  } });
}
const point = (name: string, x: number) => ({ name, x, y: 100, alt: 1000, speed: 150, ETA: 0 });
const group = (groupId: unknown = 1, name = 'Flight A') => ({
  groupId, name, frequency: 251, modulation: 0, route: { points: [point('START', 0), point('IP', 100), point('LAND', 200)] },
  units: [{ unitId: 10, name: 'Pilot 1', payload: { fuel: 1000, pylons: { 2: { CLSID: '{A}' } } },
    Radio: [{ channels: [251, 252], modulations: [0, 0] }] }],
});
const compare = (a: ReturnType<typeof snapshot>, b: ReturnType<typeof snapshot>) => compareMissionRevisions(a, b, 'creator');

describe('mission revision source normalization', () => {
  it('ignores key order, collection representation, group/unit order, and numeric strings', () => {
    const a = group(), b = group('1');
    b.units[0].payload.fuel = '1000' as unknown as number;
    const left = snapshot([a, group(2, 'Flight B')]);
    const right = snapshot([group(2, 'Flight B'), b]);
    expect(compare(left, right).changes).toEqual([]);
    const objectVersion = createMissionRevision({ theatre: 'Caucasus', dictionary: {}, mission: {
      weather: { qnh: '760' }, start_time: '36000', coalition: { blue: { country: { 1: { plane: { group: { 1: { ...a,
        route: { points: { 1: a.route.points[0], 2: a.route.points[1], 3: a.route.points[2] } }, units: { 1: a.units[0] },
      } } } } } } },
    } });
    expect(compare(snapshot([a]), objectVersion).changes).toEqual([]);
  });
  it('normalizes MHz and Hz, scalar and embedded radio channels, and radioSet alias', () => {
    const a = group(), b = group();
    const revised = { ...b, frequency: '251000000', units: [{ ...b.units[0], Radio: undefined,
      radioSet: { 1: { channels: { 1: { frequency: 251e6, modulation: 0 }, 2: { frequency: '252', modulation: '0' } } } } }] };
    expect(compare(snapshot([a]), snapshot([revised])).changes).toEqual([]);
  });
  it('preserves missing values vs explicit zero in weather, route, loadout, and radios', () => {
    const a = group(), b = group();
    delete (a.route.points[0] as Partial<typeof a.route.points[0]>).ETA;
    delete (a.units[0].payload as Partial<typeof a.units[0]['payload']>).fuel;
    a.units[0].Radio[0].modulations = [];
    b.units[0].payload.fuel = 0;
    const result = compare(snapshot([a], {}), snapshot([b], { qnh: 0 }));
    expect(result.changes.filter(x => x.kind === 'added').map(x => x.category)).toEqual(expect.arrayContaining(['weather', 'route', 'loadout', 'radio']));
  });
  it('distinguishes identical channel numbers on multiple radio banks', () => {
    const a = group(), b = group();
    a.units[0].Radio.push({ channels: [301], modulations: [0] });
    b.units[0].Radio.push({ channels: [302], modulations: [0] });
    const changes = compare(snapshot([a]), snapshot([b])).changes;
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ category: 'radio', field: 'presets (MHz).2:1.frequency', before: 301, after: 302 });
  });
  it('preserves incomplete radio channels instead of silently dropping them', () => {
    const a = group();
    const b = { ...a, units: [{ ...a.units[0], Radio: { channels: { 1: { modulation: 0 } } } }] };
    expect(compare(snapshot([a]), snapshot([b])).changes).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'presets (MHz).1:1.frequency', kind: 'removed' })]));
  });
});

describe('mission revision matching and changes', () => {
  it('matches renamed entities by stable IDs, and regenerated IDs by unique names', () => {
    const a = group(), b = group(1, 'Renamed');
    b.route.points[1].x = 150;
    b.units[0].name = 'Renamed unit';
    b.units[0].payload.fuel = 1200;
    expect(compare(snapshot([a]), snapshot([b])).changes.map(x => x.category)).toEqual(['mission', 'route', 'loadout']);
    const c = group(99);
    c.units[0].unitId = 88;
    expect(compare(snapshot([a]), snapshot([c])).changes).toEqual([]);
  });
  it('does not overwrite duplicate IDs or match missing IDs as zero', () => {
    const a = group(0, 'A'), b = group(0, 'B');
    const revised = structuredClone(b); revised.units[0].payload.fuel = 5;
    expect(compare(snapshot([a, b]), snapshot([revised, a])).changes).toHaveLength(1);
    const duplicate = group(1, 'same');
    expect(compare(snapshot([duplicate, structuredClone(duplicate)]), snapshot([group(1, 'same')])).changes.some(x => x.kind === 'removed')).toBe(true);
  });
  it('reports an inserted or deleted waypoint without shifting the rest of the route', () => {
    const a = group(), b = group(); b.route.points.splice(1, 0, point('NEW', 50));
    const result = compare(snapshot([a]), snapshot([b]));
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({ category: 'route', kind: 'added', field: 'WP 2 (NEW)' });
    expect(compare(snapshot([b]), snapshot([a])).changes[0].kind).toBe('removed');
    expect(result.routes).toHaveLength(1);
  });
  it('anchors unnamed identical points and only pairs changed points inside equal-sized gaps', () => {
    const a = group(), b = group();
    a.route.points.forEach(p => { p.name = ''; }); b.route.points.forEach(p => { p.name = ''; });
    b.route.points[1].x = 150;
    expect(compare(snapshot([a]), snapshot([b])).changes).toHaveLength(1);
    b.route.points.splice(1, 0, point('', 50));
    const changes = compare(snapshot([a]), snapshot([b])).changes;
    expect(changes.filter(x => x.kind === 'removed')).toHaveLength(1);
    expect(changes.filter(x => x.kind === 'added')).toHaveLength(2);
  });
  it('detects route reorder, changed station, weather, date and start time', () => {
    const a = group(), b = group(); b.route.points.reverse(); b.units[0].payload.pylons[2].CLSID = '{B}';
    const result = compare(snapshot([a], { wind: { atGround: { speed: 5 } } }), snapshot([b], { wind: { atGround: { speed: 10 } } }, { start_time: 37000, date: { Year: 2026 } }));
    expect(result.changes.map(x => x.category)).toEqual(expect.arrayContaining(['mission', 'loadout', 'weather', 'route']));
    expect(result.changes.find(x => x.field === 'order')).toBeDefined();
  });
  it('keeps coalition and aircraft category identity separate', () => {
    const a = snapshot([group()]);
    const b = structuredClone(a); b.flights[0].side = 'red';
    expect(compare(a, b).changes.filter(x => x.field === 'flight').map(x => x.kind)).toEqual(['removed', 'added']);
  });
  it('does not leak hidden groups in either direction or on the map in pilot mode', () => {
    const a = snapshot([group()]), b = snapshot([{ ...group(), hidden: true }]);
    b.flights[0].route[0].data.x = 999;
    const result = compareMissionRevisions(a, b, 'pilot');
    expect(result.changes).toEqual([]); expect(result.routes).toEqual([]);
    expect(compareMissionRevisions(b, a, 'pilot').changes).toEqual([]);
    expect(compare(a, b).changes).not.toHaveLength(0);
  });
  it('marks different theatres without pretending route coordinates are compatible', () => {
    const a = snapshot([group()]), b = snapshot([group()]); b.theatre = 'Syria';
    expect(compare(a, b).sameTheatre).toBe(false);
  });
  it('tolerates absent mission sections and compares source unknown weather fields', () => {
    const empty = createMissionRevision({ mission: {}, theatre: 'Unknown', dictionary: {} });
    expect(compare(empty, empty).changes).toEqual([]);
    const b = { ...empty, weather: { futureField: false } };
    expect(compare(empty, b).changes[0].kind).toBe('added');
  });
});

describe('source edge cases', () => {
  it('reads neutral coalition aircraft from the DCS neutrals key', () => {
    const a = createMissionRevision({ theatre: 'Caucasus', dictionary: {}, mission: {
      coalition: { neutrals: { country: [{ helicopter: { group: [group()] } }] } },
    } });
    expect(a.flights).toHaveLength(1); expect(a.flights[0].side).toBe('neutral');
    const b = structuredClone(a); b.flights[0].route[0].data.x = 100;
    expect(compare(a, b).changes[0].category).toBe('route');
  });
  it('resolves dictionary names and scopes duplicate IDs by aircraft category', () => {
    const source = { theatre: 'Caucasus', dictionary: { DictKey_name: 'Flight A' }, mission: {
      coalition: { blue: { country: [{ plane: { group: [group(1, 'DictKey_name')] }, helicopter: { group: [group(1)] } }] } },
    } };
    const a = createMissionRevision(source); const b = structuredClone(a);
    expect(a.flights[0].name).toBe('Flight A'); b.flights[1].route[0].data.x = 100;
    expect(compare(a, b).changes).toHaveLength(1);
  });
  it('handles a large route of alternating stable and edited points without insertion cascades', () => {
    const a = group(), b = group();
    a.route.points = Array.from({ length: 2000 }, (_, i) => point('', i));
    b.route.points = a.route.points.map((p, i) => ({ ...p, x: i % 2 ? p.x + .5 : p.x }));
    expect(compare(snapshot([a]), snapshot([b])).changes).toHaveLength(1000);
  });
});
