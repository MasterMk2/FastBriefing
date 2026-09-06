import type { MissionData, MissionMeta, Weather, Coalition, Flight, Unit, RoutePoint, SupportAsset, AIGroup, TriggerZone, Drawing, NavPoint, Airbase, Payload, Pylon, RadioPreset, WindLayer, UserNotes } from '../types/mission';
import { dcsToLatLon, windFromTo } from '../utils/coordinates';

function getValue(obj: unknown, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current;
}

function getNumber(obj: unknown, path: string[], defaultValue = 0): number {
  const val = getValue(obj, path);
  return typeof val === 'number' ? val : defaultValue;
}

function getString(obj: unknown, path: string[], defaultValue = ''): string {
  const val = getValue(obj, path);
  return typeof val === 'string' ? val : defaultValue;
}

function getArray(obj: unknown, path: string[]): unknown[] {
  const val = getValue(obj, path);
  return Array.isArray(val) ? val : [];
}

function resolveDictKey(key: string, dictionary: Record<string, string>): string {
  if (key.startsWith('DictKey_')) {
    return dictionary[key] || key;
  }
  return key;
}

function resolveResKey(key: string, mapResource: Record<string, string>): string {
  if (key.startsWith('ResKey_')) {
    return mapResource[key] || key;
  }
  return key;
}

export function normalizeMission(
  parsed: { mission: unknown; theatre: string; warehouses: unknown; dictionary: Record<string, string>; mapResource: Record<string, string> },
  _settings: { coordinateFormat: string; unitSystem: string; viewMode: string }
): MissionData {
  const mission = parsed.mission as Record<string, unknown>;
  const theatre = parsed.theatre;
  const warehouses = parsed.warehouses as Record<string, unknown>;
  const dictionary = parsed.dictionary;
  const mapResource = parsed.mapResource;
  
  const warnings: string[] = [];
  
  const meta = normalizeMeta(mission, dictionary, mapResource, theatre);
  const weather = normalizeWeather(mission, dictionary);
  const coalitions = normalizeCoalitions(mission, warehouses, dictionary, mapResource, theatre, warnings);
  const userNotes = createEmptyUserNotes();
  
  return {
    meta,
    weather,
    coalitions,
    userNotes,
    warnings,
  };
}

function normalizeMeta(mission: Record<string, unknown>, dictionary: Record<string, string>, mapResource: Record<string, string>, theatre: string): MissionMeta {
  const date = getValue(mission, ['date']) as Record<string, unknown> || {};
  const startTime = getNumber(mission, ['start_time']);
  const utcOffset = getNumber(mission, ['utcOffset'], 0);
  
  return {
    sortie: resolveDictKey(getString(mission, ['sortie']), dictionary),
    description: resolveDictKey(getString(mission, ['descriptionText']), dictionary),
    descriptionBlueTask: resolveDictKey(getString(mission, ['descriptionBlueTask']), dictionary),
    descriptionRedTask: resolveDictKey(getString(mission, ['descriptionRedTask']), dictionary),
    descriptionNeutralTask: resolveDictKey(getString(mission, ['descriptionNeutralsTask']), dictionary),
    theatre,
    date: {
      Year: getNumber(date, ['Year']),
      Month: getNumber(date, ['Month']),
      Day: getNumber(date, ['Day']),
    },
    startTime,
    utcOffset,
    meVersion: getNumber(mission, ['version']),
    images: [
      resolveResKey(getString(mission, ['pictureFileNameB']), mapResource),
      resolveResKey(getString(mission, ['pictureFileNameR']), mapResource),
      resolveResKey(getString(mission, ['pictureFileNameN']), mapResource),
      resolveResKey(getString(mission, ['pictureFileNameServer']), mapResource),
    ].filter(Boolean),
  };
}

function normalizeWeather(mission: Record<string, unknown>, _dictionary: Record<string, string>): Weather {
  const weather = getValue(mission, ['weather']) as Record<string, unknown> || {};
  const wind = getValue(weather, ['wind']) as Record<string, unknown> || {};
  
  const qnhMmHg = getNumber(weather, ['qnh'], 760);
  
  return {
    temperature: getNumber(weather, ['season', 'temperature']),
    qnh: {
      mmHg: qnhMmHg,
      hPa: qnhMmHg * 1.33322,
      inHg: qnhMmHg * 0.0393701,
    },
    wind: [
      normalizeWindLayer(wind, 'atGround', 'ground'),
      normalizeWindLayer(wind, 'at2000', '2000'),
      normalizeWindLayer(wind, 'at8000', '8000'),
    ],
    clouds: normalizeClouds(weather),
    visibility: getNumber(weather, ['visibility', 'distance']),
    fog: {
      thickness: getNumber(weather, ['fog', 'thickness']),
      visibility: getNumber(weather, ['fog', 'visibility']),
      enabled: getValue(weather, ['enable_fog']) === true,
    },
    dust: {
      density: getNumber(weather, ['dust_density']),
      enabled: getValue(weather, ['enable_dust']) === true,
    },
    turbulence: {
      ground: getNumber(weather, ['groundTurbulence']),
    },
  };
}

function normalizeWindLayer(wind: Record<string, unknown>, key: string, level: 'ground' | '2000' | '8000'): WindLayer {
  const layer = getValue(wind, [key]) as Record<string, unknown> || {};
  const dirTo = getNumber(layer, ['dir'], 0);
  const { from } = windFromTo(dirTo);
  return {
    level,
    from,
    to: dirTo,
    speed: getNumber(layer, ['speed']),
  };
}

function normalizeClouds(weather: Record<string, unknown>): { preset: string; label: string; base: number } {
  const clouds = getValue(weather, ['clouds']) as Record<string, unknown> || {};
  const preset = getString(clouds, ['preset']);
  const base = getNumber(clouds, ['base']);
  return {
    preset,
    label: preset,
    base,
  };
}

function normalizeCoalitions(
  mission: Record<string, unknown>,
  warehouses: Record<string, unknown>,
  dictionary: Record<string, string>,
  mapResource: Record<string, string>,
  theatre: string,
  warnings: string[]
): { blue: Coalition; red: Coalition; neutral: Coalition } {
  const coalitionData = getValue(mission, ['coalition']) as Record<string, unknown> || {};
  
  return {
    blue: normalizeCoalition('blue', coalitionData, warehouses, dictionary, mapResource, theatre, warnings),
    red: normalizeCoalition('red', coalitionData, warehouses, dictionary, mapResource, theatre, warnings),
    neutral: normalizeCoalition('neutrals', coalitionData, warehouses, dictionary, mapResource, theatre, warnings),
  };
}

function normalizeCoalition(
  side: string,
  coalitionData: Record<string, unknown>,
  warehouses: Record<string, unknown>,
  dictionary: Record<string, string>,
  _mapResource: Record<string, string>,
  theatre: string,
  _warnings: string[]
): Coalition {
  const sideData = getValue(coalitionData, [side]) as Record<string, unknown> || {};
  const bullseye = getValue(sideData, ['bullseye']) as Record<string, unknown> || {};
  const bullseyeX = getNumber(bullseye, ['x']);
  const bullseyeY = getNumber(bullseye, ['y']);
  const bullseyeLatLon = dcsToLatLon(theatre, bullseyeX, bullseyeY) || [0, 0];
  
  return {
    bullseye: { xy: [bullseyeX, bullseyeY], latlon: bullseyeLatLon },
    navPoints: normalizeNavPoints(sideData, theatre),
    airbases: normalizeAirbases(sideData, warehouses, dictionary, _mapResource, theatre),
    flights: normalizeFlights(sideData, dictionary, _mapResource, theatre),
    support: normalizeSupport(sideData, dictionary, _mapResource, theatre),
    aiGroups: normalizeAIGroups(sideData, dictionary, theatre),
    zones: normalizeZones(sideData, theatre),
    drawings: normalizeDrawings(sideData),
  };
}

function normalizeNavPoints(sideData: Record<string, unknown>, theatre: string): NavPoint[] {
  const navPoints = getArray(sideData, ['nav_points']);
  return navPoints.map((np, i) => {
    const point = np as Record<string, unknown>;
    const x = getNumber(point, ['x']);
    const y = getNumber(point, ['y']);
    return {
      index: i + 1,
      name: getString(point, ['name']),
      xy: [x, y],
      latlon: dcsToLatLon(theatre, x, y) || [0, 0],
    };
  });
}

function normalizeAirbases(
  sideData: Record<string, unknown>,
  warehouses: Record<string, unknown>,
  dictionary: Record<string, string>,
  _mapResource: Record<string, string>,
  theatre: string
): Airbase[] {
  const countries = getValue(sideData, ['country']) as unknown[];
  const airports = getValue(warehouses, ['airports']) as Record<string, unknown> || {};
  const airbases: Airbase[] = [];
  
  for (const country of countries) {
    const c = country as Record<string, unknown>;
    const planes = getArray(c, ['plane']);
    const helicopters = getArray(c, ['helicopter']);
    const ships = getArray(c, ['ship']);
    const vehicles = getArray(c, ['vehicle']);
    const statics = getArray(c, ['static']);
    
    for (const group of [...planes, ...helicopters, ...ships, ...vehicles, ...statics]) {
      const g = group as Record<string, unknown>;
      const groups = getArray(g, ['group']);
      for (const grp of groups) {
        const groupData = grp as Record<string, unknown>;
        const route = getValue(groupData, ['route']) as Record<string, unknown> || {};
        const points = getArray(route, ['points']);
        
        for (const point of points) {
          const p = point as Record<string, unknown>;
          const airdromeId = getNumber(p, ['airdromeId']);
          if (airdromeId > 0 && airports[airdromeId]) {
            const airport = airports[airdromeId] as Record<string, unknown>;
            const latlon = dcsToLatLon(theatre, getNumber(airport, ['x']), getNumber(airport, ['y'])) || [0, 0];
            airbases.push({
              id: airdromeId,
              name: resolveDictKey(getString(airport, ['name']), dictionary),
              latlon,
              owner: getString(airport, ['coalition'], 'NEUTRAL'),
              runways: [],
              atc: [],
              tacan: undefined,
              ils: undefined,
            });
          }
        }
      }
    }
  }
  
  return airbases;
}

function normalizeFlights(
  sideData: Record<string, unknown>,
  dictionary: Record<string, string>,
  _mapResource: Record<string, string>,
  theatre: string
): Flight[] {
  const countries = getValue(sideData, ['country']) as unknown[];
  const flights: Flight[] = [];
  
  for (const country of countries) {
    const c = country as Record<string, unknown>;
    const planes = getArray(c, ['plane']);
    const helicopters = getArray(c, ['helicopter']);
    
    for (const group of [...planes, ...helicopters]) {
      const g = group as Record<string, unknown>;
      const groups = getArray(g, ['group']);
      
      for (const grp of groups) {
        const groupData = grp as Record<string, unknown>;
        const units = getArray(groupData, ['units']);
        
        const hasClient = units.some(u => {
          const unit = u as Record<string, unknown>;
          const skill = getString(unit, ['skill']);
          return skill === 'Client' || skill === 'Player';
        });
        
        if (!hasClient) continue;
        
        const route = getValue(groupData, ['route']) as Record<string, unknown> || {};
        const routePoints = getArray(route, ['points']);
        
        flights.push({
          groupId: getNumber(groupData, ['groupId']),
          name: resolveDictKey(getString(groupData, ['name']), dictionary),
          callsign: normalizeCallsign(getValue(groupData, ['callsign']), dictionary),
          type: getString(units[0] as Record<string, unknown>, ['type']),
          task: resolveDictKey(getString(groupData, ['task']), dictionary),
          frequency: getNumber(groupData, ['frequency']),
          modulation: getNumber(groupData, ['modulation']),
          hidden: getValue(groupData, ['hidden']) === true,
          units: normalizeUnits(units, dictionary, theatre),
          route: normalizeRoutePoints(routePoints, theatre),
        });
      }
    }
  }
  
  return flights;
}

function normalizeCallsign(callsign: unknown, dictionary: Record<string, string>): string {
  if (!callsign) return '';
  if (typeof callsign === 'number') return String(callsign);
  if (typeof callsign === 'object') {
    const c = callsign as Record<string, unknown>;
    if (c.name) return resolveDictKey(getString(c, ['name']), dictionary);
    if (c[1] && typeof c[1] === 'object') {
      const name = getString(c[1] as Record<string, unknown>, ['name']);
      if (name) return resolveDictKey(name, dictionary);
    }
  }
  return String(callsign);
}

function normalizeUnits(units: unknown[], dictionary: Record<string, string>, _theatre: string): Unit[] {
  return units.map((u) => {
    const unit = u as Record<string, unknown>;
    const payload = getValue(unit, ['payload']) as Record<string, unknown> || {};
    const pylons = getArray(payload, ['pylons']);
    const radios = getArray(unit, ['Radio', 'channels']) || getArray(unit, ['radioSet', 'channels']);
    
    return {
      unitId: getNumber(unit, ['unitId']),
      name: resolveDictKey(getString(unit, ['name']), dictionary),
      tailNumber: getString(unit, ['onboard_num']),
      skill: getString(unit, ['skill']),
      livery: getString(unit, ['livery_id']),
      payload: normalizePayload(pylons),
      radios: normalizeRadios(radios),
      props: getValue(unit, ['AddPropAircraft']) as Record<string, unknown> || {},
      datalink: normalizeDatalink(getValue(unit, ['datalinks'])),
    };
  });
}

function normalizePayload(pylons: unknown[]): Payload {
  const pylonList: Pylon[] = [];
  let totalWeight = 0;
  
  for (const pylon of pylons) {
    const p = pylon as Record<string, unknown>;
    const n = getNumber(p, ['n']);
    const clsid = getString(p, ['CLSID']);
    if (clsid) {
      pylonList.push({
        station: String(n),
        clsid,
        name: clsid,
        count: 1,
        weight: 0,
      });
    }
  }
  
  return {
    pylons: pylonList,
    fuel: 0,
    chaff: 0,
    flare: 0,
    gun: 0,
    weight: totalWeight,
  };
}

function normalizeRadios(radios: unknown[]): RadioPreset[] {
  return radios.map((r, i) => {
    const radio = r as Record<string, unknown>;
    return {
      channel: i + 1,
      frequency: getNumber(radio, ['frequency']) / 1000000,
      modulation: getNumber(radio, ['modulation']),
      name: getString(radio, ['name']),
    };
  });
}

function normalizeDatalink(datalinks: unknown): { link16?: { flightLead: boolean; team: number } } | undefined {
  if (!datalinks) return undefined;
  const dl = datalinks as Record<string, unknown>;
  const link16 = dl.Link16 as Record<string, unknown> | undefined;
  if (!link16) return undefined;
  return {
    link16: {
      flightLead: getValue(link16, ['settings', 'flightLead']) === true,
      team: getNumber(link16, ['settings', 'team']),
    },
  };
}

function normalizeRoutePoints(routePoints: unknown[], theatre: string): RoutePoint[] {
  return routePoints.map((rp, i) => {
    const point = rp as Record<string, unknown>;
    const x = getNumber(point, ['x']);
    const y = getNumber(point, ['y']);
    const alt = getNumber(point, ['alt']);
    const speed = getNumber(point, ['speed']);
    const eta = getNumber(point, ['ETA']);
    const latlon = dcsToLatLon(theatre, x, y) || [0, 0];
    
    return {
      index: i + 1,
      name: getString(point, ['name']),
      action: getString(point, ['action']),
      xy: [x, y],
      latlon,
      alt,
      altType: getString(point, ['alt_type']) as 'BARO' | 'RADIO',
      speed,
      eta,
      tasks: [],
      airdromeId: getNumber(point, ['airdromeId']) || undefined,
      helipadId: getNumber(point, ['helipadId']) || undefined,
      linkUnit: getNumber(point, ['linkUnit']) || undefined,
      leg: undefined,
    };
  });
}

function normalizeSupport(
  sideData: Record<string, unknown>,
  dictionary: Record<string, string>,
  _mapResource: Record<string, string>,
  theatre: string
): SupportAsset[] {
  const countries = getValue(sideData, ['country']) as unknown[];
  const support: SupportAsset[] = [];
  
  for (const country of countries) {
    const c = country as Record<string, unknown>;
    const planes = getArray(c, ['plane']);
    const helicopters = getArray(c, ['helicopter']);
    const ships = getArray(c, ['ship']);
    
    for (const group of [...planes, ...helicopters, ...ships]) {
      const g = group as Record<string, unknown>;
      const groups = getArray(g, ['group']);
      
      for (const grp of groups) {
        const groupData = grp as Record<string, unknown>;
        const task = getString(groupData, ['task']);
        getArray(groupData, ['units']);
        
        if (task === 'Tanker') {
          support.push(normalizeTanker(groupData, dictionary, theatre));
        } else if (task === 'AWACS') {
          support.push(normalizeAWACS(groupData, dictionary, theatre));
        }
      }
    }
    
    for (const ship of ships) {
      const s = ship as Record<string, unknown>;
      const groups = getArray(s, ['group']);
      for (const grp of groups) {
        const groupData = grp as Record<string, unknown>;
        if (getString(groupData, ['type']).includes('CVN') || getString(groupData, ['type']).includes('LHA')) {
          support.push(normalizeCarrier(groupData, dictionary, theatre));
        }
      }
    }
  }
  
  return support;
}

function normalizeTanker(groupData: Record<string, unknown>, dictionary: Record<string, string>, _theatre: string): SupportAsset {
  const units = getArray(groupData, ['units']);
  const unit = units[0] as Record<string, unknown>;
  const x = getNumber(unit, ['x']);
  const y = getNumber(unit, ['y']);
  const route = getValue(groupData, ['route']) as Record<string, unknown> || {};
  const points = getArray(route, ['points']);
  
  return {
    kind: 'tanker',
    callsign: normalizeCallsign(getValue(groupData, ['callsign']), dictionary),
    frequency: getNumber(groupData, ['frequency']),
    position: [x, y],
    tacan: undefined,
    orbit: points.length > 0 ? {
      point: [getNumber(points[0], ['x']), getNumber(points[0], ['y'])],
      altitude: getNumber(points[0], ['alt']),
      speed: getNumber(points[0], ['speed']),
      pattern: 'racetrack',
    } : undefined,
  };
}

function normalizeAWACS(groupData: Record<string, unknown>, dictionary: Record<string, string>, _theatre: string): SupportAsset {
  const units = getArray(groupData, ['units']);
  const unit = units[0] as Record<string, unknown>;
  const x = getNumber(unit, ['x']);
  const y = getNumber(unit, ['y']);
  const route = getValue(groupData, ['route']) as Record<string, unknown> || {};
  const points = getArray(route, ['points']);
  
  return {
    kind: 'awacs',
    callsign: normalizeCallsign(getValue(groupData, ['callsign']), dictionary),
    frequency: getNumber(groupData, ['frequency']),
    position: [x, y],
    orbit: points.length > 0 ? {
      point: [getNumber(points[0], ['x']), getNumber(points[0], ['y'])],
      altitude: getNumber(points[0], ['alt']),
      speed: getNumber(points[0], ['speed']),
      pattern: 'racetrack',
    } : undefined,
  };
}

function normalizeCarrier(groupData: Record<string, unknown>, dictionary: Record<string, string>, _theatre: string): SupportAsset {
  const units = getArray(groupData, ['units']);
  const unit = units[0] as Record<string, unknown>;
  const x = getNumber(unit, ['x']);
  const y = getNumber(unit, ['y']);
  
  return {
    kind: 'carrier',
    callsign: resolveDictKey(getString(groupData, ['name']), dictionary),
    frequency: 0,
    position: [x, y],
  };
}

function normalizeAIGroups(sideData: Record<string, unknown>, _dictionary: Record<string, string>, _theatre: string): AIGroup[] {
  const countries = getValue(sideData, ['country']) as unknown[];
  const groups: AIGroup[] = [];
  
  for (const country of countries) {
    const c = country as Record<string, unknown>;
    const planes = getArray(c, ['plane']);
    const helicopters = getArray(c, ['helicopter']);
    const ships = getArray(c, ['ship']);
    const vehicles = getArray(c, ['vehicle']);
    const statics = getArray(c, ['static']);
    
    for (const group of [...planes, ...helicopters, ...ships, ...vehicles, ...statics]) {
      const g = group as Record<string, unknown>;
      const unitGroups = getArray(g, ['group']);
      
      for (const grp of unitGroups) {
        const groupData = grp as Record<string, unknown>;
        const units = getArray(groupData, ['units']);
        if (units.length === 0) continue;
        
        const unit = units[0] as Record<string, unknown>;
        const skill = getString(unit, ['skill']);
        if (skill === 'Client' || skill === 'Player') continue;
        
        const x = getNumber(unit, ['x']);
        const y = getNumber(unit, ['y']);
        
        groups.push({
          category: getString(group, ['category'], 'unknown'),
          type: getString(unit, ['type']),
          count: units.length,
          position: [x, y],
          threatRange: 0,
          hidden: getValue(groupData, ['hidden']) === true,
          lateActivation: getValue(groupData, ['lateActivation']) === true,
          startTime: getNumber(groupData, ['start_time']),
        });
      }
    }
  }
  
  return groups;
}

function normalizeZones(sideData: Record<string, unknown>, _theatre: string): TriggerZone[] {
  const zones = getArray(sideData, ['zones']);
  return zones.map((zone, i) => {
    const z = zone as Record<string, unknown>;
    const x = getNumber(z, ['x']);
    const y = getNumber(z, ['y']);
    const zoneType = getNumber(z, ['type'], 0);
    const vertices = getArray(z, ['vertices']).map(v => [getNumber(v as Record<string, unknown>, ['x']), getNumber(v as Record<string, unknown>, ['y'])] as [number, number]);
    const color = getArray(z, ['color']);
    
    return {
      zoneId: getNumber(z, ['zoneId'], i + 1),
      name: getString(z, ['name']),
      xy: [x, y],
      radius: getNumber(z, ['radius']),
      type: zoneType as 0 | 2,
      vertices: vertices.length > 0 ? vertices : undefined,
      color,
      hidden: getValue(z, ['hidden']) === true,
    };
  });
}

function normalizeDrawings(sideData: Record<string, unknown>): Drawing[] {
  const drawings = getValue(sideData, ['drawings']) as Record<string, unknown> || {};
  const layers = getArray(drawings, ['layers']);
  
  return layers.map(l => {
    const layer = l as Record<string, unknown>;
    const objects = getArray(layer, ['objects']);
    return {
      layer: getString(layer, ['name']),
      visible: getValue(layer, ['visible']) !== false,
      objects: objects.map(o => {
        const obj = o as Record<string, unknown>;
        const points = getArray(obj, ['points']);
        return {
          primitiveType: getString(obj, ['primitiveType']) as 'Line' | 'Polygon' | 'TextBox' | 'Icon',
          points: points.map(p => [getNumber(p, ['x']), getNumber(p, ['y'])]),
          color: getString(obj, ['colorString'], '#ff0000'),
          fillColor: getString(obj, ['fillColorString']),
          thickness: getNumber(obj, ['thickness'], 1),
          style: getNumber(obj, ['style'], 1),
          name: getString(obj, ['name']),
        };
      }),
    };
  });
}

function createEmptyUserNotes(): UserNotes {
  return {
    missionKey: '',
    smeac: {
      situation: '',
      mission: '',
      execution: '',
      adminLogistics: '',
      commandSignal: '',
    },
    perFlight: {},
  };
}