import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseMissionArchive } from '../workers/missionParser';
import { compareMissionRevisions, createMissionRevision } from '../utils/missionRevision';

function archive(x: number, frequency: number, fuel: number) {
  return zipSync({
    theatre: strToU8('Afghanistan'),
    mission: strToU8(`mission = {
      theatre = "Afghanistan", start_time = 36000, date = { Year = 2026, Month = 10, Day = 4 },
      weather = { qnh = 760, wind = { atGround = { speed = 5, dir = 120 } } },
      coalition = { blue = { country = { [1] = { plane = { group = { [1] = {
        groupId = 4, name = "DictKey_flight", frequency = ${frequency}, modulation = 0,
        route = { points = { [1] = { name = "IP", x = ${x}, y = 50000, alt = 1000, speed = 150, ETA = 0 } } },
        units = { [1] = { unitId = 12, name = "Pilot", skill = "Client", type = "F-16C_50",
          payload = { fuel = ${fuel}, pylons = { [2] = { CLSID = "{TEST}" } } },
          Radio = { [1] = { channels = { [1] = 251000000 } } }
        } }
      } } } } } } }
    }`),
    'l10n/DEFAULT/dictionary': strToU8('dictionary = { ["DictKey_flight"] = "Test Flight" }'),
  });
}

describe('synthetic miz archive to revision diff', () => {
  it('uses the real bounded Lua/ZIP parser and resolves route, radio and payload changes', async () => {
    const before = createMissionRevision(await parseMissionArchive(archive(100000, 251, 1000)));
    const after = createMissionRevision(await parseMissionArchive(archive(101000, 252, 1200)));
    const result = compareMissionRevisions(before, after, 'creator');
    expect(result.changes.map(change => change.category).sort()).toEqual(['loadout', 'radio', 'route']);
    expect(result.routes[0].name).toContain('Test Flight');
    expect(result.routes[0].before[0].data.x).toBe(100000);
    expect(result.routes[0].after[0].data.x).toBe(101000);
  });
  it('is insensitive to zip-container differences when mission semantics are unchanged', async () => {
    const a = await parseMissionArchive(archive(100000, 251, 1000));
    const b = await parseMissionArchive(archive(100000, 251, 1000));
    expect(compareMissionRevisions(createMissionRevision(a), createMissionRevision(b), 'creator').changes).toEqual([]);
  });
});
