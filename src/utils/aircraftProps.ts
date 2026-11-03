import type { Pylon } from '../types/mission';

/**
 * Known keys of a unit's AddPropAircraft table (FR-35). Only keys seen in real
 * missions are listed (docs/research-notes.md); other keys are shown raw under
 * "その他". `labelKey` is a full i18n key in the `wingman` namespace.
 */
export interface KnownAircraftProp {
  labelKey: string;
}

export const KNOWN_AIRCRAFT_PROPS: Readonly<Record<string, KnownAircraftProp>> = {
  Sta2LaserCode: { labelKey: 'wingman:props.Sta2LaserCode' },
  Sta5LaserCode: { labelKey: 'wingman:props.Sta5LaserCode' },
  Sta8LaserCode: { labelKey: 'wingman:props.Sta8LaserCode' },
  LCFTLaserCode: { labelKey: 'wingman:props.LCFTLaserCode' },
  RCFTLaserCode: { labelKey: 'wingman:props.RCFTLaserCode' },
  IFF_M2_CODE: { labelKey: 'wingman:props.IFF_M2_CODE' },
  MountNVG: { labelKey: 'wingman:props.MountNVG' },
  SoloFlight: { labelKey: 'wingman:props.SoloFlight' },
  STN_L16: { labelKey: 'wingman:props.STN_L16' },
  VoiceCallsignNumber: { labelKey: 'wingman:props.VoiceCallsignNumber' },
};

export type AircraftPropValue =
  | { kind: 'bool'; value: boolean }
  | { kind: 'text'; text: string };

export interface KnownAircraftPropEntry {
  key: string;
  labelKey: string;
  value: AircraftPropValue;
}

export interface OtherAircraftPropEntry {
  key: string;
  value: AircraftPropValue;
}

export interface ClassifiedAircraftProps {
  known: KnownAircraftPropEntry[];
  other: OtherAircraftPropEntry[];
}

const MAX_TEXT_LENGTH = 160;

/** Turn one property value into something that can be shown. Objects are JSON text; a broken value never throws. */
export function describeAircraftPropValue(value: unknown): AircraftPropValue {
  if (typeof value === 'boolean') return { kind: 'bool', value };
  if (typeof value === 'number' || typeof value === 'string') {
    return { kind: 'text', text: truncate(String(value)) };
  }
  if (value === null || value === undefined) return { kind: 'text', text: '—' };
  try {
    return { kind: 'text', text: truncate(JSON.stringify(value) ?? '—') };
  } catch {
    return { kind: 'text', text: '—' };
  }
}

/** Split a unit's properties into the known keys (in the table's order) and the rest. */
export function classifyAircraftProps(props: Record<string, unknown> | null | undefined): ClassifiedAircraftProps {
  const known: KnownAircraftPropEntry[] = [];
  const other: OtherAircraftPropEntry[] = [];
  if (!props || typeof props !== 'object') return { known, other };

  for (const [key, value] of Object.entries(props)) {
    const description = describeAircraftPropValue(value);
    if (Object.prototype.hasOwnProperty.call(KNOWN_AIRCRAFT_PROPS, key)) {
      known.push({ key, labelKey: KNOWN_AIRCRAFT_PROPS[key].labelKey, value: description });
    } else {
      other.push({ key, value: description });
    }
  }
  return { known, other };
}

/** Pylons in station order. Stations are numbers in DCS, so "10" comes after "2". */
export function sortPylonsByStation(pylons: readonly Pylon[]): Pylon[] {
  return [...pylons].sort((a, b) => a.station.localeCompare(b.station, undefined, { numeric: true }));
}

function truncate(text: string): string {
  return text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH - 1)}…` : text;
}
