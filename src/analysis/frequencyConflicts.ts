import type { MissionData, RadioPreset, Side, SupportAsset } from '../types/mission';
import { flightKey } from '../utils/flightKey';

/** Frequency comparison tolerance in MHz (1 kHz). */
export const FREQUENCY_MATCH_TOLERANCE_MHZ = 0.001;

/**
 * Float slack so that a difference of exactly 1 kHz is not lost to rounding
 * (243.001 - 243.000 is not exactly 0.001 in binary floating point).
 */
const TOLERANCE_SLACK_MHZ = 1e-9;

export type CommunicationModulation = 'AM' | 'FM';
export type FrequencyConflictType = 'same-aircraft-preset' | 'different-flight' | 'support';

export interface CommunicationFrequency {
  id: string;
  source: 'flight' | 'support';
  /** Coalition the entry belongs to. Support assets belong to a coalition as well. */
  side: Side;
  callsign: string;
  flightId?: number;
  /** Groups the presets of one aircraft (one unit). Entries without it are compared as separate aircraft. */
  unitKey?: string;
  supportKind?: SupportAsset['kind'];
  /** Index in the coalition's support list (anchor for the support screen and lint). */
  supportIndex?: number;
  /** True for the flight-level (group) frequency. It has no channel. */
  groupFrequency?: boolean;
  radio?: number;
  channel: number;
  frequencyMHz: number;
  modulation: CommunicationModulation;
  name: string;
}

export interface FrequencyConflict {
  key: string;
  frequencyMHz: number;
  modulation: CommunicationModulation;
  users: CommunicationFrequency[];
  types: FrequencyConflictType[];
}

/**
 * Anchor of a conflict (LintFinding.anchor for L1 and the data-anchor of its row on the comms screen).
 * Built from the modulation and the frequency, so the lint finding and the screen agree without sharing
 * the conflict key (the key depends on which entries were collected).
 */
export function conflictAnchor(conflict: Pick<FrequencyConflict, 'modulation' | 'frequencyMHz'>): string {
  return `comms:conflict:${conflict.modulation}:${conflict.frequencyMHz.toFixed(3)}`;
}

export interface FrequencyEntryOptions {
  /** Only this coalition. Default: both coalitions. */
  side?: Side;
  /** Also collect each flight's group frequency (used by lint L1; the comms screen leaves it out). */
  includeGroupFrequency?: boolean;
}

/**
 * Collect the frequencies of the flights' radio presets and of the support
 * assets. Support frequencies are read as AM (the mission does not store a
 * modulation for them; see the lint notes).
 */
export function collectFrequencyEntries(mission: MissionData, options: FrequencyEntryOptions = {}): CommunicationFrequency[] {
  const sides: Side[] = options.side ? [options.side] : ['blue', 'red'];
  return sides.flatMap((side): CommunicationFrequency[] => {
    const coalition = mission.coalitions[side];
    const flightEntries = coalition.flights.flatMap((flight): CommunicationFrequency[] => {
      const key = flightKey(side, flight.groupId);
      const groupEntries: CommunicationFrequency[] = options.includeGroupFrequency
        && Number.isFinite(flight.frequency)
        && flight.frequency > 0
        ? [{
          id: `${key}:group`,
          source: 'flight',
          side,
          callsign: flight.callsign,
          flightId: flight.groupId,
          unitKey: `${key}:group`,
          groupFrequency: true,
          channel: 0,
          frequencyMHz: toMHz(flight.frequency),
          modulation: formatModulation(flight.modulation),
          name: flight.name,
        }]
        : [];
      const radioEntries = flight.units.flatMap((unit, unitIndex): CommunicationFrequency[] => {
        const unitKey = `${key}:${unit.unitId}:${unitIndex}`;
        return unit.radios.map((radio, radioIndex): CommunicationFrequency => ({
          id: `${unitKey}:radio:${radioIndex}`,
          source: 'flight',
          side,
          callsign: flight.callsign,
          flightId: flight.groupId,
          unitKey,
          radio: radio.radio,
          channel: radio.channel,
          frequencyMHz: toMHz(radio.frequency),
          modulation: formatModulation(radio.modulation),
          name: radio.name,
        }));
      });
      return [...groupEntries, ...radioEntries];
    });

    const supportEntries = coalition.support.flatMap((support, index): CommunicationFrequency[] => {
      if (!support.frequency || !Number.isFinite(support.frequency)) return [];
      return [{
        id: `${side}:support:${index}`,
        source: 'support',
        side,
        callsign: support.callsign,
        supportKind: support.kind,
        supportIndex: index,
        channel: 0,
        frequencyMHz: toMHz(support.frequency),
        modulation: 'AM',
        name: support.kind,
      }];
    });

    return [...flightEntries, ...supportEntries];
  });
}

/**
 * Stable owner key of an entry: the flight key for flight entries, and a
 * coalition-scoped index for support assets. Used for the owner filter.
 */
export function ownerKeyOf(entry: CommunicationFrequency): string {
  return entry.source === 'flight'
    ? flightKey(entry.side, entry.flightId ?? 0)
    : `${entry.side}:support:${entry.supportIndex ?? 0}`;
}

/**
 * Find frequency conflicts while keeping AM and FM on the same nominal
 * frequency separate. Two entries conflict when their frequencies differ by at
 * most the tolerance (1 kHz); a small slack keeps exact 1 kHz differences from
 * being lost to floating-point rounding.
 */
export function detectFrequencyConflicts(
  entries: CommunicationFrequency[],
  toleranceMHz: number = FREQUENCY_MATCH_TOLERANCE_MHZ,
): FrequencyConflict[] {
  const tolerance = Number.isFinite(toleranceMHz) && toleranceMHz >= 0
    ? toleranceMHz
    : FREQUENCY_MATCH_TOLERANCE_MHZ;
  const byModulation = new Map<CommunicationModulation, CommunicationFrequency[]>();

  for (const entry of entries) {
    if (!Number.isFinite(entry.frequencyMHz)) continue;
    const modulationEntries = byModulation.get(entry.modulation) ?? [];
    modulationEntries.push(entry);
    byModulation.set(entry.modulation, modulationEntries);
  }

  const conflicts: FrequencyConflict[] = [];
  for (const [modulation, modulationEntries] of byModulation) {
    const sortedEntries = [...modulationEntries].sort((a, b) => {
      const frequencyDifference = a.frequencyMHz - b.frequencyMHz;
      return frequencyDifference !== 0 ? frequencyDifference : a.id.localeCompare(b.id);
    });

    for (const group of toleranceGroups(sortedEntries, tolerance)) {
      const types = classifyFrequencyCluster(group);
      if (types.length === 0) continue;

      const users = [...group].sort((a, b) => a.id.localeCompare(b.id));
      conflicts.push({
        key: `${modulation}:${group[0].frequencyMHz.toFixed(6)}:${users.map(user => user.id).join('|')}`,
        frequencyMHz: group[0].frequencyMHz,
        modulation,
        users,
        types,
      });
    }
  }

  return conflicts.sort((a, b) => a.frequencyMHz - b.frequencyMHz);
}

/**
 * Groups of entries that conflict with each other, from entries sorted by frequency.
 * A group is a run that starts at one entry and holds every later entry within the
 * tolerance of that first entry, so every pair inside a group is a conflict. Two
 * entries are never joined through a third entry that is out of tolerance with one
 * of them (a chain such as 243.000, 243.0009, 243.0018 gives two groups, not one).
 * A run contained in an earlier run is dropped, so each group is reported once.
 */
function toleranceGroups(sorted: CommunicationFrequency[], tolerance: number): CommunicationFrequency[][] {
  const limit = tolerance + TOLERANCE_SLACK_MHZ;
  const groups: CommunicationFrequency[][] = [];
  let end = 0;
  let lastGroupEnd = -1;

  for (let start = 0; start < sorted.length; start += 1) {
    if (end < start) end = start;
    while (end + 1 < sorted.length && sorted[end + 1].frequencyMHz - sorted[start].frequencyMHz <= limit) {
      end += 1;
    }
    // The run ends are never decreasing, so a run that ends where the last group ended lies inside it.
    if (end > start && end > lastGroupEnd) {
      groups.push(sorted.slice(start, end + 1));
      lastGroupEnd = end;
    }
  }
  return groups;
}

function classifyFrequencyCluster(entries: CommunicationFrequency[]): FrequencyConflictType[] {
  if (entries.length < 2) return [];

  const flightEntries = entries.filter(entry => entry.source === 'flight');
  const supportEntries = entries.filter(entry => entry.source === 'support');
  const types: FrequencyConflictType[] = [];

  const entriesByUnit = new Map<string, number>();
  for (const entry of flightEntries) {
    const unitKey = entry.unitKey ?? entry.id;
    entriesByUnit.set(unitKey, (entriesByUnit.get(unitKey) ?? 0) + 1);
  }
  if ([...entriesByUnit.values()].some(count => count > 1)) {
    types.push('same-aircraft-preset');
  }

  const flightIds = new Set(flightEntries.map(entry => `${entry.side}:${entry.flightId ?? entry.id}`));
  if (flightIds.size > 1) {
    types.push('different-flight');
  }

  if (supportEntries.length > 0 && (flightEntries.length > 0 || supportEntries.length > 1)) {
    types.push('support');
  }

  return types;
}

/** Channel label for a radio preset: "R2 / CH3" when the mission has several radio banks, else "CH3". */
export function formatRadioChannel(radio: Pick<RadioPreset, 'radio' | 'channel'>): string {
  return radio.radio === undefined ? `CH${radio.channel}` : `R${radio.radio} / CH${radio.channel}`;
}

/** DCS stores frequencies in Hz; values already in MHz are kept as they are. */
export function toMHz(frequency: number): number {
  return Math.abs(frequency) >= 1000 ? frequency / 1000000 : frequency;
}

function formatModulation(modulation: number): CommunicationModulation {
  return modulation === 0 ? 'AM' : 'FM';
}
