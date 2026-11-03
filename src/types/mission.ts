import type { BriefingPreset, BriefingSection } from '../utils/briefingSections';

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
  /** Undefined when the beacon position is unresolved (never [0, 0]). */
  latlon?: [number, number];
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
  /** One-based radio bank number when the mission stores multiple radios. */
  radio?: number;
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
  magneticBearing?: number;
  time?: number;
  cumulativeDistance: number;
  cumulativeTime?: number;
}

export interface SupportAsset {
  kind: 'tanker' | 'awacs' | 'carrier' | 'jtac';
  callsign: string;
  /** DCS group flag. Pilot view removes hidden support assets (G11). */
  hidden: boolean;
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
  /** Undefined when the position is unresolved (never [0, 0]). */
  latlon?: [number, number];
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
  detectionRange?: number;
  detectionRangeUnitType?: string;
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

export type IssueSeverity = 'error' | 'warning' | 'info';

/**
 * Stable machine-readable issue codes. Display text is resolved through the
 * `issues` i18n namespace from `code` and `params`; never store prose here.
 */
export type IssueCode =
  | 'threat.rangeUnrecorded'
  | 'unit.unknownType'
  | 'weapon.unknownClsid'
  | 'weather.cloudPresetUnknown'
  | 'weather.qnhDefaulted'
  | 'weather.temperatureDefaulted'
  | 'airbase.nameMissing'
  | 'map.unsupported'
  | 'time.utcOffsetUnknown'
  | 'magvar.unsupported'
  | 'parse.unknownNode'
  | 'coord.unresolved';

/** Coalition that produced an issue. Absent for issues about the whole mission (map, weather, time). */
export type IssueSide = 'blue' | 'red' | 'neutral';

export interface MissionIssue {
  code: IssueCode;
  severity: IssueSeverity;
  params?: Record<string, string | number>;
  /** Set when the issue comes from one coalition's data; pilot view drops other sides (D1). */
  side?: IssueSide;
}

export interface MissionData {
  /** Stable fingerprint of the source .miz archive bytes. */
  sourceFingerprint: string;
  meta: MissionMeta;
  weather: Weather;
  coalitions: { blue: Coalition; red: Coalition; neutral: Coalition };
  userNotes: UserNotes;
  /** Deduplicated issues found while reading the mission (replaces `warnings`). */
  issues: MissionIssue[];
}

export interface UserNotes {
  missionKey: string;
  smeac: SMEACNotes;
  perFlight: Record<string, FlightNotes>;
  waypoints: Record<string, WaypointAnnotation>;
  mapAnnotations: MapAnnotation[];
}

export interface WaypointAnnotation {
  purpose: string;
  notes: string;
  syncGroupId?: string;
}

export interface MapPinAnnotation {
  id: string;
  kind: 'pin';
  position: [number, number];
  label: string;
  notes: string;
  color: string;
}

export interface MapStrokeAnnotation {
  id: string;
  kind: 'stroke';
  points: [number, number][];
  color: string;
  width: number;
}

export type MapAnnotation = MapPinAnnotation | MapStrokeAnnotation;

export interface SMEACNotes {
  situation: string;
  mission: string;
  execution: string;
  adminLogistics: string;
  commandSignal: string;
}

export interface FlightNotes {
  jokerFuel: number | null;
  bingoFuel: number | null;
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
  briefingImages: Map<string, Uint8Array>;
  /** Issues raised while parsing the Lua source (for example unknown node types). */
  parseIssues?: MissionIssue[];
}

export type CoordinateFormat = 'DDM' | 'DMS' | 'MGRS' | 'DEC';
export type CoordinateFormatSetting = CoordinateFormat | 'aircraft';
export type UnitSystem = 'metric' | 'imperial';
export type ThemeId = 'ffs' | 'standard' | 'night';
export type Side = 'blue' | 'red';

/** Display settings, schema version 5 (see src/hooks/useSettings.tsx). */
export interface DisplaySettings {
  language: 'ja' | 'en';                 // UI language
  outputLanguage: 'ja' | 'en';           // language of exported briefing material (FR-99)
  theme: ThemeId;                        // 'default' from v2-v4 is migrated to 'standard'
  fontScale: 'standard' | 'large';
  viewMode: 'creator' | 'pilot';
  /** Displayed coalition. null means "not chosen": the side with more client flights is used (D2). */
  side: Side | null;
  coordinateFormat: CoordinateFormatSetting;
  unitSystem: UnitSystem;
  altitudeUnit: 'ft' | 'm';
  speedUnit: 'kt' | 'kmh';
  distanceUnit: 'nm' | 'km';
  pressureUnit: 'hPa' | 'inHg' | 'mmHg';
  temperatureUnit: 'C' | 'F';
  windDisplay: 'from' | 'to' | 'both';
  timeDisplay: 'local' | 'zulu' | 'both';
  mapBackground: boolean;
  kneeboardWidth: 1536 | 2048 | 3072;
  briefingSections: BriefingSection[];
  briefingPresets: BriefingPreset[];
}
