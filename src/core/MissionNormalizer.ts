import type { MissionData, MissionMeta, Weather, Coalition, Flight, Unit, RoutePoint, SupportAsset, AIGroup, TriggerZone, Drawing, NavPoint, Airbase, Payload, Pylon, RadioPreset, WindLayer, UserNotes, TACAN, ICLS, Link4, JTACInfo } from '../types/mission';
import { dcsToLatLon } from '../utils/coordinates';
import { windFromTo, pressureValuesFromMmHg } from '../utils/units';
import threatRangeData from '../data/threatRanges.json';
import utcOffsetData from '../data/utcOffsets.json';
import weaponData from '../data/weapons.json';
import cloudPresetData from '../data/cloudPresets.json';

interface ThreatRangeReference {
  threatRange: number;
  detectionRange: number;
}

interface WeaponReference {
  name: string;
  weight: number;
}

interface CloudPresetReference {
  label: string;
  baseMin: number;
  baseMax: number;
  coverage: string;
  weather?: string;
}

const threatRanges = threatRangeData as unknown as Record<string, ThreatRangeReference>;
const utcOffsets = utcOffsetData as unknown as Record<string, number>;
const weapons = weaponData as unknown as Record<string, WeaponReference>;
const cloudPresets = cloudPresetData as unknown as Record<string, CloudPresetReference>;

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
  return getOptionalNumber(obj, path) ?? defaultValue;
}

function getOptionalNumber(obj: unknown, path: string[]): number | undefined {
  const val = getValue(obj, path);
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const parsed = Number(val);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
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
  if (dcsToLatLon(theatre, 0, 0) == null) {
    addWarning(warnings, `未対応のマップ: ${theatre}（座標を解決できません）`);
  }
  
  const meta = normalizeMeta(mission, dictionary, mapResource, theatre, warnings);
  const weather = normalizeWeather(mission, dictionary, warnings);
  const zones = normalizeZones(mission);
  const drawings = normalizeDrawings(mission);
  const coalitions = normalizeCoalitions(mission, warehouses, dictionary, mapResource, theatre, warnings, zones, drawings);
  const userNotes = createEmptyUserNotes();
  
  return {
    meta,
    weather,
    coalitions,
    userNotes,
    warnings,
  };
}

function normalizeMeta(mission: Record<string, unknown>, dictionary: Record<string, string>, mapResource: Record<string, string>, theatre: string, warnings: string[]): MissionMeta {
  const date = getValue(mission, ['date']) as Record<string, unknown> || {};
  const startTime = getNumber(mission, ['start_time']);
  const utcOffset = resolveUtcOffset(mission, theatre, warnings);
  
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

function resolveUtcOffset(mission: Record<string, unknown>, theatre: string, warnings: string[]): number {
  const missionOffset = getOptionalNumber(mission, ['utcOffset']);
  if (missionOffset !== undefined) return missionOffset;

  const tableOffset = utcOffsets[theatre];
  if (typeof tableOffset === 'number' && Number.isFinite(tableOffset)) return tableOffset;

  addWarning(warnings, `UTC オフセット未収録: ${theatre}`);
  return 0;
}

function normalizeWeather(mission: Record<string, unknown>, _dictionary: Record<string, string>, warnings: string[]): Weather {
  const weather = getValue(mission, ['weather']) as Record<string, unknown> || {};
  const wind = getValue(weather, ['wind']) as Record<string, unknown> || {};
  
  const qnhMmHg = getNumber(weather, ['qnh'], 760);
  const qnh = pressureValuesFromMmHg(qnhMmHg);
  const temperature = getNumber(weather, ['season', 'temperature']);
  const dewPointValue = getValue(weather, ['season', 'dew_point']) ?? getValue(weather, ['season', 'dewPoint']) ?? getValue(weather, ['dew_point']) ?? getValue(weather, ['dewPoint']);
  
  return {
    temperature,
    ...(typeof dewPointValue === 'number' || typeof dewPointValue === 'string' ? { dewPoint: getNumber({ value: dewPointValue }, ['value']) } : {}),
    qnh,
    wind: [
      normalizeWindLayer(wind, 'atGround', 'ground'),
      normalizeWindLayer(wind, 'at2000', '2000'),
      normalizeWindLayer(wind, 'at8000', '8000'),
    ],
    clouds: normalizeClouds(weather, warnings),
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

function normalizeClouds(weather: Record<string, unknown>, warnings: string[]): Weather['clouds'] {
  const clouds = getValue(weather, ['clouds']) as Record<string, unknown> || {};
  const preset = getString(clouds, ['preset']);
  const rawBase = getNumber(clouds, ['base']);
  const densityValue = getValue(clouds, ['density']);
  const density = typeof densityValue === 'number' || typeof densityValue === 'string'
    ? getNumber({ value: densityValue }, ['value'])
    : undefined;
  const reference = preset ? cloudPresets[preset] : undefined;

  if (preset && !reference) {
    addWarning(warnings, `未知の雲プリセット: ${preset}`);
  }

  const coverage = reference?.coverage ?? legacyCloudCoverage(density);
  const label = reference?.label ?? (coverage ? `${legacyCloudLabel(coverage)}${density === undefined ? '' : ` (${density})`}` : 'Sky condition unavailable');
  return {
    preset,
    label,
    base: rawBase,
    ...(density === undefined ? {} : { density }),
    ...(coverage ? { coverage } : {}),
    ...(reference?.weather ? { weather: reference.weather } : {}),
  };
}

function legacyCloudCoverage(density: number | undefined): string | undefined {
  if (density === undefined) return undefined;
  if (density <= 0) return 'SKC';
  if (density <= 2) return 'FEW';
  if (density <= 5) return 'SCT';
  if (density <= 8) return 'BKN';
  return 'OVC';
}

function legacyCloudLabel(coverage: string): string {
  switch (coverage) {
    case 'SKC': return 'Clear';
    case 'FEW': return 'Few';
    case 'SCT': return 'Scattered';
    case 'BKN': return 'Broken';
    case 'OVC': return 'Overcast';
    default: return 'Clouds';
  }
}

function addWarning(warnings: string[], warning: string): void {
  if (!warnings.includes(warning)) warnings.push(warning);
}

function normalizeCoalitions(
  mission: Record<string, unknown>,
  warehouses: Record<string, unknown>,
  dictionary: Record<string, string>,
  mapResource: Record<string, string>,
  theatre: string,
  warnings: string[],
  zones: TriggerZone[],
  drawings: Drawing[]
): { blue: Coalition; red: Coalition; neutral: Coalition } {
  const coalitionData = getValue(mission, ['coalition']) as Record<string, unknown> || {};
  
  return {
    blue: normalizeCoalition('blue', coalitionData, warehouses, dictionary, mapResource, theatre, warnings, zones, drawings),
    red: normalizeCoalition('red', coalitionData, warehouses, dictionary, mapResource, theatre, warnings, zones, drawings),
    neutral: normalizeCoalition('neutrals', coalitionData, warehouses, dictionary, mapResource, theatre, warnings, zones, drawings),
  };
}

function normalizeCoalition(
  side: string,
  coalitionData: Record<string, unknown>,
  warehouses: Record<string, unknown>,
  dictionary: Record<string, string>,
  _mapResource: Record<string, string>,
  theatre: string,
  warnings: string[],
  zones: TriggerZone[],
  drawings: Drawing[]
): Coalition {
  const sideData = getValue(coalitionData, [side]) as Record<string, unknown> || {};
  const bullseye = getValue(sideData, ['bullseye']) as Record<string, unknown> || {};
  const bullseyeX = getNumber(bullseye, ['x']);
  const bullseyeY = getNumber(bullseye, ['y']);
  const bullseyeCoordinate = normalizeLatLon(theatre, bullseyeX, bullseyeY);
  
  return {
    bullseye: { xy: [bullseyeX, bullseyeY], ...bullseyeCoordinate },
    navPoints: normalizeNavPoints(sideData, theatre),
    airbases: normalizeAirbases(sideData, warehouses, dictionary, _mapResource, theatre),
    flights: normalizeFlights(sideData, dictionary, _mapResource, theatre, warnings),
    support: normalizeSupport(sideData, dictionary, _mapResource, theatre),
    aiGroups: normalizeAIGroups(sideData, dictionary, theatre, warnings),
    zones,
    drawings,
  };
}

function normalizeLatLon(theatre: string, x: number, y: number): { latlon: [number, number]; latlonResolved: boolean } {
  const latlon = dcsToLatLon(theatre, x, y);
  return {
    latlon: latlon ?? [0, 0],
    latlonResolved: latlon != null,
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
      ...normalizeLatLon(theatre, x, y),
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
  const countries = getValue(sideData, ['country']) as unknown[] || [];
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
            const coordinate = normalizeLatLon(theatre, getNumber(airport, ['x']), getNumber(airport, ['y']));
            airbases.push({
              id: airdromeId,
              name: resolveDictKey(getString(airport, ['name']), dictionary),
              ...coordinate,
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
  theatre: string,
  warnings: string[]
): Flight[] {
  const countries = getValue(sideData, ['country']) as unknown[] || [];
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
          units: normalizeUnits(units, dictionary, theatre, warnings),
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

function normalizeUnits(units: unknown[], dictionary: Record<string, string>, _theatre: string, warnings: string[]): Unit[] {
  return units.map((u) => {
    const unit = u as Record<string, unknown>;
    const payload = getValue(unit, ['payload']) as Record<string, unknown> || {};
    const primaryRadios = getArray(unit, ['Radio', 'channels']);
    const radios = primaryRadios.length > 0 ? primaryRadios : getArray(unit, ['radioSet', 'channels']);
    
    return {
      unitId: getNumber(unit, ['unitId']),
      name: resolveDictKey(getString(unit, ['name']), dictionary),
      tailNumber: getString(unit, ['onboard_num']),
      skill: getString(unit, ['skill']),
      livery: getString(unit, ['livery_id']),
      payload: normalizePayload(payload, warnings),
      radios: normalizeRadios(radios),
      props: getValue(unit, ['AddPropAircraft']) as Record<string, unknown> || {},
      datalink: normalizeDatalink(getValue(unit, ['datalinks'])),
    };
  });
}

export function normalizePayload(payload: Record<string, unknown>, warnings: string[] = []): Payload {
  const pylons = getArray(payload, ['pylons']);
  const pylonList: Pylon[] = [];
  const fuel = getNumber(payload, ['fuel']);
  const chaff = getNumber(payload, ['chaff']);
  const flare = getNumber(payload, ['flare']);
  const gun = getNumber(payload, ['gun']);
  let totalWeight = fuel;
  
  for (const pylon of pylons) {
    const p = pylon as Record<string, unknown>;
    const n = getNumber(p, ['n']);
    const clsid = getString(p, ['CLSID']);
    if (clsid) {
      const reference = weapons[clsid];
      const weight = reference?.weight ?? 0;
      if (!reference) addWarning(warnings, `未知の兵装 CLSID: ${clsid}`);
      pylonList.push({
        station: String(n),
        clsid,
        name: reference?.name ?? fallbackWeaponName(clsid),
        count: 1,
        weight,
      });
      totalWeight += weight;
    }
  }
  
  return {
    pylons: pylonList,
    fuel,
    chaff,
    flare,
    gun,
    weight: totalWeight,
  };
}

function fallbackWeaponName(clsid: string): string {
  const readable = clsid
    .replace(/^\{/, '')
    .replace(/\}$/, '')
    .replace(/^CLSID[_-]?/i, '');
  return `${readable || clsid} (未収録)`;
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
    const coordinate = normalizeLatLon(theatre, x, y);
    
    return {
      index: i + 1,
      name: getString(point, ['name']),
      action: getString(point, ['action']),
      xy: [x, y],
      ...coordinate,
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
  const countries = getValue(sideData, ['country']) as unknown[] || [];
  const support: SupportAsset[] = [];
  
  for (const country of countries) {
    const c = country as Record<string, unknown>;
    const planes = getArray(c, ['plane']);
    const helicopters = getArray(c, ['helicopter']);
    const ships = getArray(c, ['ship']);
    const vehicles = getArray(c, ['vehicle']);
    
    // Every source group is visited exactly once, including ships.  A carrier
    // with a task such as Tanker is classified by the task branch and cannot
    // be appended a second time by a separate ship pass.
    for (const group of [...planes, ...helicopters, ...ships, ...vehicles]) {
      const g = group as Record<string, unknown>;
      const groups = getArray(g, ['group']);
      
      for (const grp of groups) {
        const groupData = grp as Record<string, unknown>;
        const task = getString(groupData, ['task']);
        const units = getArray(groupData, ['units']);
        const unitType = getString(units[0], ['type']) || getString(groupData, ['type']);
        const signals = extractSupportSignals(groupData);
        const carrier = isCarrierType(unitType);
        const jtac = isJTACGroup(unitType, signals.hasFacTask || /JTAC|FAC/i.test(task));
        
        if (task === 'Tanker') {
          support.push(normalizeTanker(groupData, dictionary, theatre, signals));
        } else if (task === 'AWACS') {
          support.push(normalizeAWACS(groupData, dictionary, theatre, signals));
        } else if (carrier) {
          support.push(normalizeCarrier(groupData, dictionary, theatre, signals));
        } else if (jtac) {
          support.push(normalizeJTAC(groupData, dictionary, theatre, signals, unitType));
        }
      }
    }
  }
  
  return support;
}

interface ExtractedSupportSignals {
  tacan?: TACAN;
  icls?: ICLS;
  link4?: Link4;
  laserCode?: number | string;
  datalink?: string | number;
  hasFacTask: boolean;
}

function normalizeTanker(groupData: Record<string, unknown>, dictionary: Record<string, string>, theatre: string, signals: ExtractedSupportSignals): SupportAsset {
  const units = getArray(groupData, ['units']);
  const unit = units[0] as Record<string, unknown>;
  const x = getNumber(unit, ['x']);
  const y = getNumber(unit, ['y']);
  const coordinate = normalizeLatLon(theatre, x, y);
  const route = getValue(groupData, ['route']) as Record<string, unknown> || {};
  const points = getArray(route, ['points']);
  const { hasFacTask: _hasFacTask, ...signalFields } = signals;
  
  return {
    kind: 'tanker',
    callsign: normalizeCallsign(getValue(groupData, ['callsign']), dictionary),
    frequency: getNumber(groupData, ['frequency']),
    position: [x, y],
    ...coordinate,
    ...signalFields,
    orbit: points.length > 0 ? {
      point: [getNumber(points[0], ['x']), getNumber(points[0], ['y'])],
      altitude: getNumber(points[0], ['alt']),
      speed: getNumber(points[0], ['speed']),
      pattern: 'racetrack',
    } : undefined,
  };
}

function normalizeAWACS(groupData: Record<string, unknown>, dictionary: Record<string, string>, theatre: string, signals: ExtractedSupportSignals): SupportAsset {
  const units = getArray(groupData, ['units']);
  const unit = units[0] as Record<string, unknown>;
  const x = getNumber(unit, ['x']);
  const y = getNumber(unit, ['y']);
  const coordinate = normalizeLatLon(theatre, x, y);
  const route = getValue(groupData, ['route']) as Record<string, unknown> || {};
  const points = getArray(route, ['points']);
  const { hasFacTask: _hasFacTask, ...signalFields } = signals;
  
  return {
    kind: 'awacs',
    callsign: normalizeCallsign(getValue(groupData, ['callsign']), dictionary),
    frequency: getNumber(groupData, ['frequency']),
    position: [x, y],
    ...coordinate,
    ...signalFields,
    orbit: points.length > 0 ? {
      point: [getNumber(points[0], ['x']), getNumber(points[0], ['y'])],
      altitude: getNumber(points[0], ['alt']),
      speed: getNumber(points[0], ['speed']),
      pattern: 'racetrack',
    } : undefined,
  };
}

function normalizeCarrier(groupData: Record<string, unknown>, dictionary: Record<string, string>, theatre: string, signals: ExtractedSupportSignals): SupportAsset {
  const units = getArray(groupData, ['units']);
  const unit = units[0] as Record<string, unknown>;
  const x = getNumber(unit, ['x']);
  const y = getNumber(unit, ['y']);
  const coordinate = normalizeLatLon(theatre, x, y);
  const { hasFacTask: _hasFacTask, ...signalFields } = signals;
  
  return {
    kind: 'carrier',
    callsign: normalizeCallsign(getValue(groupData, ['callsign']), dictionary) || resolveDictKey(getString(groupData, ['name']), dictionary),
    frequency: getNumber(groupData, ['frequency']),
    position: [x, y],
    ...coordinate,
    ...signalFields,
  };
}

function normalizeJTAC(
  groupData: Record<string, unknown>,
  dictionary: Record<string, string>,
  theatre: string,
  signals: ExtractedSupportSignals,
  unitType: string
): SupportAsset {
  const units = getArray(groupData, ['units']);
  const unit = units[0] as Record<string, unknown>;
  const { hasFacTask: _hasFacTask, ...signalFields } = signals;
  const frequency = getNumber(groupData, ['frequency']);
  const callsign = normalizeCallsign(getValue(groupData, ['callsign']), dictionary) || getString(unit, ['name']);
  const coordinate = normalizeLatLon(theatre, getNumber(unit, ['x']), getNumber(unit, ['y']));
  const jtac: JTACInfo = {
    unitType: unitType || undefined,
    frequency: frequency || undefined,
    laserCode: signals.laserCode,
    datalink: signals.datalink,
  };

  return {
    kind: 'jtac',
    callsign,
    frequency,
    position: [getNumber(unit, ['x']), getNumber(unit, ['y'])],
    ...coordinate,
    ...signalFields,
    jtac,
  };
}

function isCarrierType(type: string): boolean {
  return /(?:CVN|LHA|LHD|KUZNECOV|TARAWA|STENNIS|FLEET\s*CARRIER|FORRESTAL|INVINCIBLE)/i.test(type);
}

function isJTACGroup(unitType: string, hasFacTask: boolean): boolean {
  return hasFacTask || /(?:^|[ _-])(JTAC|FAC|MCC)(?:$|[ _-])/i.test(unitType) || unitType.toLowerCase() === 'soldier';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function scalarString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function scalarValue(value: unknown): number | string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') return value;
  return undefined;
}

function extractSupportSignals(groupData: Record<string, unknown>): ExtractedSupportSignals {
  const result: ExtractedSupportSignals = { hasFacTask: false };
  const route = getValue(groupData, ['route']);
  const points = isObject(route) ? getArray(route, ['points']) : [];
  const visited = new Set<object>();

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!isObject(value) || visited.has(value)) return;
    visited.add(value);

    const action = isObject(value.action) ? value.action : value;
    const actionId = getString(action, ['id']) || getString(value, ['id']) || getString(value, ['type']);
    if (/FAC|JTAC/i.test(actionId)) result.hasFacTask = true;

    const params = isObject(action.params) ? action.params : isObject(value.params) ? value.params : undefined;
    if (actionId === 'ActivateBeacon') {
      const beaconParams = params ?? {};
      const channel = scalarString(getValue(beaconParams, ['channel']) ?? getValue(beaconParams, ['channelNumber'])) ?? '';
      const mode = scalarString(getValue(beaconParams, ['modeChannel']) ?? getValue(beaconParams, ['mode'])) ?? '';
      const callsign = scalarString(getValue(beaconParams, ['callsign']));
      const system = scalarValue(getValue(beaconParams, ['system']) ?? getValue(beaconParams, ['type']));
      result.tacan = { channel, mode, callsign, system, latlon: [0, 0], latlonResolved: false };
    } else if (actionId === 'ActivateICLS') {
      const iclsParams = params ?? {};
      const channelValue = scalarValue(getValue(iclsParams, ['channel']) ?? getValue(iclsParams, ['channelNumber'])) ?? '';
      const callsign = scalarString(getValue(iclsParams, ['callsign']));
      result.icls = { channel: channelValue, callsign, latlon: [0, 0], latlonResolved: false };
    } else if (actionId === 'ActivateLink4') {
      const linkParams = params ?? {};
      result.link4 = {
        frequency: getNumber(linkParams, ['frequency']) || undefined,
        channel: scalarValue(getValue(linkParams, ['channel'])),
        callsign: scalarString(getValue(linkParams, ['callsign'])),
      };
    }

    for (const [key, child] of Object.entries(value)) {
      if (/laser(?:_?code)?|designation|lase_code/i.test(key)) {
        const candidate = scalarValue(child);
        if (candidate !== undefined) result.laserCode = candidate;
      }
      if (/datalink|data_link/i.test(key)) {
        const candidate = scalarValue(child);
        if (candidate !== undefined) result.datalink = candidate;
      }
      visit(child);
    }
  };

  visit(points);
  return result;
}

function normalizeAIGroups(sideData: Record<string, unknown>, _dictionary: Record<string, string>, theatre: string, warnings: string[]): AIGroup[] {
  const countries = getValue(sideData, ['country']) as unknown[] || [];
  const groups: AIGroup[] = [];
  
  for (const country of countries) {
    const c = country as Record<string, unknown>;
    const planes = getArray(c, ['plane']);
    const helicopters = getArray(c, ['helicopter']);
    const ships = getArray(c, ['ship']);
    const vehicles = getArray(c, ['vehicle']);
    const statics = getArray(c, ['static']);
    
    const groupsByCategory = [
      { category: 'plane', groups: planes },
      { category: 'helicopter', groups: helicopters },
      { category: 'ship', groups: ships },
      { category: 'vehicle', groups: vehicles },
      { category: 'static', groups: statics },
    ];

    for (const { category: categoryHint, groups: categoryGroups } of groupsByCategory) {
      for (const group of categoryGroups) {
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
          const coordinate = normalizeLatLon(theatre, x, y);
          const type = getString(unit, ['type']);
          const category = getString(group, ['category'], categoryHint);
          const threatResolution = resolveGroupThreat(units, isThreatCandidateCategory(category), warnings);

          groups.push({
            category,
            type,
            count: units.length,
            position: [x, y],
            ...coordinate,
            ...threatResolution,
            hidden: getValue(groupData, ['hidden']) === true,
            lateActivation: getValue(groupData, ['lateActivation']) === true,
            startTime: getNumber(groupData, ['start_time']),
          });
        }
      }
    }
  }
  
  return groups;
}

interface ThreatResolution {
  threatRange: number;
  threatRangeSource?: AIGroup['threatRangeSource'];
  threatRangeUnitType?: string;
}

function isThreatCandidateCategory(category: string): boolean {
  const normalizedCategory = category.trim().toLowerCase();
  return normalizedCategory === 'vehicle' || normalizedCategory === 'ship';
}

function resolveGroupThreat(units: unknown[], isThreatCandidate: boolean, warnings: string[]): ThreatResolution {
  let bestRange = 0;
  let bestSource: AIGroup['threatRangeSource'] = isThreatCandidate ? 'unknown' : undefined;
  let bestType: string | undefined;

  for (const rawUnit of units) {
    const unit = rawUnit as Record<string, unknown>;
    const type = getString(unit, ['type']);
    const threat = threatRanges[type];
    if (!threat) {
      if (isThreatCandidate && type) addWarning(warnings, `未知の脅威半径: ${type}`);
      continue;
    }

    const threatRange = threat.threatRange > 0 ? threat.threatRange : threat.detectionRange > 0 ? threat.detectionRange : 0;
    const source: AIGroup['threatRangeSource'] = threat.threatRange > 0
      ? 'reference'
      : threat.detectionRange > 0
        ? 'detection'
        : 'reference';
    const shouldReplace = threatRange > bestRange
      || (threatRange === bestRange && source === 'reference' && bestSource === 'detection');
    if (shouldReplace || bestType === undefined) {
      bestRange = threatRange;
      bestSource = source;
      bestType = type;
    }
  }

  return {
    threatRange: bestRange,
    threatRangeSource: bestSource,
    threatRangeUnitType: bestType,
  };
}

function normalizeZones(mission: Record<string, unknown>): TriggerZone[] {
  const zones = getArray(mission, ['triggers', 'zones']);
  return zones.map((zone, i) => {
    const z = zone as Record<string, unknown>;
    const x = getNumber(z, ['x']);
    const y = getNumber(z, ['y']);
    const zoneType = getNumber(z, ['type'], 0);
    const rawVertices = getArray(z, ['vertices']);
    const vertices = (rawVertices.length > 0 ? rawVertices : getArray(z, ['verticies']))
      .map(v => [getNumber(v as Record<string, unknown>, ['x']), getNumber(v as Record<string, unknown>, ['y'])] as [number, number]);
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

function normalizeDrawings(mission: Record<string, unknown>): Drawing[] {
  const drawings = getValue(mission, ['drawings']) as Record<string, unknown> || {};
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
