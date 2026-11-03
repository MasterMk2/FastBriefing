// A mission whose groups have no group callsign, run through the real normalizer. Not used by the app.
// DCS often leaves the group callsign out (sample.miz: Chevy, Dealer, Texaco, Overlord keep it on the units only),
// so the screens must not depend on a hand-built Flight that already has a callsign.
import { normalizeMission } from '../core/MissionNormalizer';
import type { MissionData } from '../types/mission';

const SETTINGS = { coordinateFormat: 'DDM', unitSystem: 'metric', viewMode: 'creator' };

function client(unitId: number, frequency: number): Record<string, unknown> {
  return {
    type: 'FA-18C_hornet',
    skill: 'Client',
    x: 100,
    y: 200,
    unitId,
    name: `Pilot #${unitId}`,
    // The unit-level callsign DCS writes: numeric slots and a name. It is not the group callsign.
    callsign: { 1: 7, 2: 1, 3: unitId, name: `Unit${unitId}` },
    Radio: { channels: { 1: { frequency, modulation: 0 } } },
  };
}

function waypoint(name: string, x: number, eta: number): Record<string, unknown> {
  return { name, x, y: 0, alt: 6000, alt_type: 'BARO', speed: 200, ETA: eta, action: 'Turning Point' };
}

/**
 * Blue: Chevy (ETA only on TARGET, as in sample.miz) and Dealer (TARGET 30 s later, so the two are near),
 * a tanker Texaco and an AWACS Overlord. No group carries a callsign.
 */
export function normalizedCallsignlessMission(): MissionData {
  const chevy = {
    groupId: 11,
    name: 'Chevy',
    task: 'CAS',
    frequency: 251000000,
    units: [client(1, 251000000)],
    route: { points: [waypoint('', 0, 0), waypoint('PUSH', 10000, 0), waypoint('TARGET', 20000, 1800)] },
  };
  const dealer = {
    groupId: 12,
    name: 'Dealer',
    task: 'CAS',
    frequency: 262000000,
    units: [client(2, 262000000)],
    route: { points: [waypoint('', 0, 0), waypoint('TARGET', 21000, 1830)] },
  };
  const support = (groupId: number, name: string, task: string, frequency: number) => ({
    groupId,
    name,
    task,
    frequency,
    units: [{ type: 'KC-135', skill: 'Excellent', x: 5000, y: 5000, unitId: groupId, name: `${name} Pilot #1`, callsign: { 1: 1, 2: 1, 3: 1, name: `${name}11` } }],
    route: { points: [{ x: 5000, y: 5000, alt: 6000, speed: 180 }] },
  });
  const blue = {
    country: [{
      plane: [{
        category: 'plane',
        group: [chevy, dealer, support(13, 'Texaco', 'Refueling', 305000000), support(14, 'Overlord', 'AWACS', 270000000)],
      }],
    }],
  };
  return normalizeMission({
    mission: {
      sortie: 'Callsignless',
      date: { Year: 2026, Month: 9, Day: 6 },
      start_time: 43200,
      weather: {
        qnh: 760,
        season: { temperature: 8, dewPoint: -2 },
        wind: { atGround: { dir: 90, speed: 2 } },
        visibility: { distance: 10000 },
        clouds: { preset: 'Preset1', base: 1500 },
      },
      coalition: { blue, red: {}, neutrals: {} },
    },
    theatre: 'Caucasus',
    warehouses: { airports: {} },
    dictionary: {},
    mapResource: {},
  }, SETTINGS);
}
