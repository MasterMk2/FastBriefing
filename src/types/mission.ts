export interface MissionMeta {
  sortie: string;
  description: string;
  descriptionBlueTask: string;
  descriptionRedTask: string;
  descriptionNeutralTask: string;
  theatre: string;
  date: { Year: number; Month: number; Day: number };
  startTime: number;
  utcOffset: number;
  meVersion: number;
  images: string[];
}

export interface Weather {
  temperature: number;
  /** Optional DCS/dew-point source field; METAR omits it when unavailable. */
  dewPoint?: number;
  qnh: { mmHg: number; hPa: number; inHg: number };
  wind: WindLayer[];
  clouds: { preset: string; label: string; base: number; density?: number; coverage?: string; weather?: string };
  visibility: number;
  fog: { thickness: number; visibility: number; enabled: boolean };
  dust: { density: number; enabled: boolean };
  turbulence: { ground: number };
}

export interface WindLayer {
  level: 'ground' | '2000' | '8000';
  from: number;
  to: number;
  speed: number;
}

export interface Coalition {
  bullseye: { xy: [number, number]; latlon: [number, number]; latlonResolved?: boolean };
  navPoints: NavPoint[];
  airbases: Airbase[];
  flights: Flight[];
  support: SupportAsset[];
  aiGroups: AIGroup[];
  zones: TriggerZone[];
  drawings: Drawing[];
}

export interface NavPoint {
  index: number;
  name: string;
  xy: [number, number];
  latlon: [number, number];
  latlonResolved?: boolean;
}

export interface Airbase {
  id: number;
  name: string;
  latlon: [number, number];
  latlonResolved?: boolean;
  owner: string;
  runways: Runway[];
  atc: ATCFrequency[];
  tacan?: TACAN;
  ils?: ILS;
}

export interface Runway {
  id: number;
  name: string;
  latlon: [number, number];
  heading: number;
  length: number;
  width: number;
}

export interface ATCFrequency {
  frequency: number;
  modulation: number;
  name: string;
}

export interface TACAN {
  channel: string;
  mode: string;
  latlon: [number, number];
  latlonResolved?: boolean;
  callsign?: string;
  system?: number | string;
}

export interface ILS {
  frequency: number;
  runway: string;
  latlon: [number, number];
}

export interface Flight {
  groupId: number;
  name: string;
  callsign: string;
  type: string;
  task: string;
  frequency: number;
  modulation: number;
  hidden: boolean;
  units: Unit[];
  route: RoutePoint[];
}

export interface Unit {
  unitId: number;
  name: string;
  tailNumber: string;
  skill: string;
  livery: string;
  payload: Payload;
  radios: RadioPreset[];
  props: Record<string, unknown>;
  datalink?: DatalinkInfo;
}

export interface Payload {
  pylons: Pylon[];
  fuel: number;
  chaff: number;
  flare: number;
  gun: number;
  weight: number;
}

export interface Pylon {
  station: string;
  clsid: string;
  name: string;
  /** One entry per source pylon; count is 1 so the UI can address stations directly. */
  count: number;
  weight: number;
}

export interface RadioPreset {
  channel: number;
  frequency: number;
  modulation: number;
  name: string;
}

export interface DatalinkInfo {
  link16?: Link16Settings;
}

export interface Link16Settings {
  flightLead: boolean;
  team: number;
}

export interface RoutePoint {
  index: number;
  name: string;
  action: string;
  xy: [number, number];
  latlon: [number, number];
  latlonResolved?: boolean;
  alt: number;
  altType: 'BARO' | 'RADIO';
  speed: number;
  eta: number;
  tasks: RouteTask[];
  airdromeId?: number;
  helipadId?: number;
  linkUnit?: number;
  leg?: LegInfo;
}

export interface RouteTask {
  type: string;
  params: Record<string, unknown>;
}

export interface LegInfo {
  distance: number;
  trueBearing: number;
  magneticBearing: number;
  time: number;
  cumulativeDistance: number;
  cumulativeTime: number;
}

export interface SupportAsset {
  kind: 'tanker' | 'awacs' | 'carrier' | 'jtac';
  callsign: string;
  frequency: number;
  tacan?: TACAN;
  icls?: ICLS;
  link4?: Link4;
  laserCode?: number | string;
  datalink?: string | number;
  jtac?: JTACInfo;
  orbit?: OrbitInfo;
  position: [number, number];
  latlon?: [number, number];
  latlonResolved?: boolean;
}

export interface ICLS {
  channel: number | string;
  latlon: [number, number];
  latlonResolved?: boolean;
  callsign?: string;
}

export interface Link4 {
  frequency?: number;
  channel?: number | string;
  callsign?: string;
}

export interface JTACInfo {
  unitType?: string;
  frequency?: number;
  laserCode?: number | string;
  datalink?: string | number;
}

export interface OrbitInfo {
  point: [number, number];
  altitude: number;
  speed: number;
  pattern: string;
}

export interface AIGroup {
  category: string;
  type: string;
  count: number;
  position: [number, number];
  latlon?: [number, number];
  latlonResolved?: boolean;
  threatRange?: number;
  threatRangeSource?: 'reference' | 'detection' | 'unknown';
  threatRangeUnitType?: string;
  hidden: boolean;
  lateActivation: boolean;
  startTime: number;
}

export interface TriggerZone {
  zoneId: number;
  name: string;
  xy: [number, number];
  radius: number;
  type: 0 | 2;
  vertices?: [number, number][];
  color: unknown[];
  hidden: boolean;
}

export interface Drawing {
  layer: string;
  visible: boolean;
  objects: DrawingObject[];
}

export interface DrawingObject {
  primitiveType: 'Line' | 'Polygon' | 'TextBox' | 'Icon';
  points: [number, number][];
  color: string;
  fillColor?: string;
  thickness: number;
  style: number;
  name: string;
}

export interface MissionData {
  meta: MissionMeta;
  weather: Weather;
  coalitions: { blue: Coalition; red: Coalition; neutral: Coalition };
  userNotes: UserNotes;
  warnings: string[];
}

export interface UserNotes {
  missionKey: string;
  smeac: SMEACNotes;
  perFlight: Record<string, FlightNotes>;
}

export interface SMEACNotes {
  situation: string;
  mission: string;
  execution: string;
  adminLogistics: string;
  commandSignal: string;
}

export interface FlightNotes {
  jokerFuel: number;
  bingoFuel: number;
  tot: string;
  pilotName: string;
  customNotes: string;
}

export interface ParsedMissionFile {
  mission: unknown;
  theatre: string;
  warehouses: unknown;
  options: unknown;
  dictionary: Record<string, string>;
  mapResource: Record<string, string>;
  kneeboardFiles: Map<string, Uint8Array>;
}

export type CoordinateFormat = 'DDM' | 'DMS' | 'MGRS' | 'DEC';
export type UnitSystem = 'metric' | 'imperial';

export interface DisplaySettings {
  coordinateFormat: CoordinateFormat;
  unitSystem: UnitSystem;
  altitudeUnit: 'ft' | 'm';
  speedUnit: 'kt' | 'kmh';
  distanceUnit: 'nm' | 'km';
  pressureUnit: 'hPa' | 'inHg' | 'mmHg';
  temperatureUnit: 'C' | 'F';
  viewMode: 'creator' | 'pilot';
  language: 'ja' | 'en';
  outputLanguage: 'ja' | 'en';
}
