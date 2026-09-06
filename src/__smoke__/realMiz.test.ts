import { describe, expect, it } from 'vitest';
// @ts-expect-error Vitest executes this test in Node; this project intentionally omits @types/node.
import { readdir, readFile } from 'node:fs/promises';
import { normalizeMission } from '../core/MissionNormalizer';
import { parseMissionArchive } from '../workers/missionParser';
import utcOffsetData from '../data/utcOffsets.json';

declare const process: {
  env: Record<string, string | undefined>;
};

const smokeDirectory = process.env.SMOKE_MIZ_DIR?.trim() ?? '';
const settings = { coordinateFormat: 'DDM', unitSystem: 'metric', viewMode: 'creator' };

function filePath(directory: string, name: string): string {
  return `${directory.replace(/[\\/]+$/, '')}/${name}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sourcePylonItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  const entries = Object.entries(value);
  if (entries.length === 0 || !entries.every(([key]) => /^\d+$/.test(key))) return [];
  return entries.map(([, item]) => item);
}

function hasSourceClientFlight(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(item => hasSourceClientFlight(item));
  if (!isRecord(value)) return false;
  if (value.skill === 'Client' || value.skill === 'Player') return true;
  return Object.values(value).some(item => hasSourceClientFlight(item));
}

function hasSourceClientPylons(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(item => hasSourceClientPylons(item));
  if (!isRecord(value)) return false;

  const skill = value.skill;
  const payload = value.payload;
  if ((skill === 'Client' || skill === 'Player') && isRecord(payload) && payload.pylons !== undefined) {
    return sourcePylonItems(payload.pylons).some(item => (
      isRecord(item) && typeof item.CLSID === 'string' && item.CLSID.trim() !== ''
    ));
  }
  return Object.values(value).some(item => hasSourceClientPylons(item));
}

describe.skipIf(!smokeDirectory)('real .miz smoke test', () => {
  it('parses and normalizes every mission archive in SMOKE_MIZ_DIR', async () => {
    const names = (await readdir(smokeDirectory) as unknown as string[])
      .filter(name => /\.miz$/i.test(name))
      .sort((left, right) => left.localeCompare(right));
    expect(names.length, 'SMOKE_MIZ_DIR に .miz がありません').toBeGreaterThan(0);
    const parseFailures: string[] = [];
    let pylonMissionCount = 0;
    let threatMissionCount = 0;

    for (const name of names) {
      let parsed: Awaited<ReturnType<typeof parseMissionArchive>>;
      try {
        parsed = await parseMissionArchive(new Uint8Array(await readFile(filePath(smokeDirectory, name))));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        parseFailures.push(`${name}: ${message}`);
        console.log(JSON.stringify({ file: name, parseError: message }));
        continue;
      }

      const normalized = normalizeMission(parsed, settings);
      const flights = [
        ...normalized.coalitions.blue.flights,
        ...normalized.coalitions.red.flights,
        ...normalized.coalitions.neutral.flights,
      ];
      const routePointCount = flights.reduce((total, flight) => total + flight.route.length, 0);
      const pylonCount = flights.reduce(
        (total, flight) => total + flight.units.reduce((unitTotal, unit) => unitTotal + unit.payload.pylons.length, 0),
        0,
      );
      const allAiGroups = [
        ...normalized.coalitions.blue.aiGroups,
        ...normalized.coalitions.red.aiGroups,
        ...normalized.coalitions.neutral.aiGroups,
      ];
      const threatGroups = allAiGroups.filter(group => (group.threatRange ?? 0) > 0);
      const threatCandidateGroups = allAiGroups.filter(group => /^(vehicle|ship)$/i.test(group.category));
      const expectedUtcOffset = utcOffsetData[parsed.theatre as keyof typeof utcOffsetData];
      const sourceHasClientData = hasSourceClientFlight(parsed.mission);
      const sourceHasPylonData = hasSourceClientPylons(parsed.mission);

      if (pylonCount > 0) pylonMissionCount += 1;
      if (threatGroups.length > 0) threatMissionCount += 1;

      console.log(
        JSON.stringify({
          file: name,
          flights: flights.length,
          routePoints: routePointCount,
          pylons: pylonCount,
          threatGroups: threatGroups.length,
          warnings: normalized.warnings.length,
          sourceHasClientData,
          sourceHasPylonData,
          theatre: parsed.theatre,
          utcOffset: normalized.meta.utcOffset,
          sortie: normalized.meta.sortie,
          description: normalized.meta.description,
        }),
      );

      if (sourceHasClientData) {
        expect.soft(flights.length, `${name}: flight count`).toBeGreaterThan(0);
        expect.soft(routePointCount, `${name}: route point count`).toBeGreaterThan(0);
      }
      expect.soft(normalized.meta.sortie, `${name}: sortie leaked a DictKey`).not.toMatch(/^DictKey_/);
      expect.soft(normalized.meta.description, `${name}: description leaked a DictKey`).not.toMatch(/^DictKey_/);
      expect.soft(expectedUtcOffset, `${name}: theatre is not in the UTC offset table`).not.toBeUndefined();
      expect.soft(normalized.meta.utcOffset, `${name}: UTC offset`).toBe(expectedUtcOffset);
      if (sourceHasClientData && sourceHasPylonData) {
        expect.soft(pylonCount, `${name}: pylon count`).toBeGreaterThan(0);
      }
      if (threatCandidateGroups.length > 0) {
        expect.soft(threatGroups.length, `${name}: resolved threat group count`).toBeGreaterThan(0);
        expect.soft(threatGroups.every(group => (group.threatRange ?? 0) > 0), `${name}: threat range`).toBe(true);
      }
    }

    expect(parseFailures, `解析に失敗した .miz: ${parseFailures.join('; ')}`).toEqual([]);
    expect(pylonMissionCount, '搭載パイロンを取得できたミッション数').toBeGreaterThan(0);
    expect(threatMissionCount, '脅威半径を解決できたミッション数').toBeGreaterThan(0);
  });
});
