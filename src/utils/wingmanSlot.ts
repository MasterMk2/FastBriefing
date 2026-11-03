import { useSyncExternalStore } from 'react';
import type { Flight, MissionData, Side } from '../types/mission';
import { flightKey } from './flightKey';

/**
 * The aircraft chosen as "自機" on this device (F4). Stored only in this browser,
 * never in exported material. missionKey guards against a choice made for another
 * mission file: a mismatch counts as "not chosen".
 */
export const WINGMAN_STORAGE_KEY = 'fastbriefing-wingman';

export interface WingmanSlot {
  missionKey: string;
  flightKey: string;
  unitId: number;
}

type SlotStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const FLIGHT_KEY_PATTERN = /^(blue|red):\d+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Check every field of a stored value. Anything unexpected returns null (treated as not chosen). */
export function parseWingmanSlot(value: unknown): WingmanSlot | null {
  if (!isRecord(value)) return null;
  const { missionKey, flightKey: key, unitId } = value;
  if (typeof missionKey !== 'string' || missionKey === '') return null;
  if (typeof key !== 'string' || !FLIGHT_KEY_PATTERN.test(key)) return null;
  if (typeof unitId !== 'number' || !Number.isInteger(unitId)) return null;
  return { missionKey, flightKey: key, unitId };
}

function getStorage(): SlotStorage | null {
  try {
    if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) return null;
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function readRaw(storage: Pick<Storage, 'getItem'> | null): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(WINGMAN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function parseRaw(raw: string | null): WingmanSlot | null {
  if (raw === null) return null;
  try {
    return parseWingmanSlot(JSON.parse(raw));
  } catch {
    return null;
  }
}

interface SlotState {
  slot: WingmanSlot | null;
}

// One shared value for every component on the page. The state object changes only when
// the value changes, so useSyncExternalStore does not re-render on each read.
let state: SlotState | null = null;
const listeners = new Set<() => void>();

function publish(slot: WingmanSlot | null): void {
  state = { slot };
  for (const listener of listeners) listener();
}

function currentState(): SlotState {
  if (!state) state = { slot: parseRaw(readRaw(getStorage())) };
  return state;
}

/**
 * Re-read the stored value (used when another tab changes it, and by tests).
 * Ignores failures: the value then falls back to "not chosen".
 */
export function reloadWingmanSlot(storage: Pick<Storage, 'getItem'> | null = getStorage()): void {
  publish(parseRaw(readRaw(storage)));
}

/** The value this page currently holds: the saved choice, or the one kept in memory after a refused write. */
export function getWingmanSlot(): WingmanSlot | null {
  return currentState().slot;
}

/**
 * Save the choice (null clears it). Returns false when the browser store refused the
 * write. The page keeps the value in memory either way, so the choice still works for
 * this session.
 */
export function writeWingmanSlot(slot: WingmanSlot | null, storage: SlotStorage | null = getStorage()): boolean {
  let saved = storage !== null;
  if (storage) {
    try {
      if (slot === null) storage.removeItem(WINGMAN_STORAGE_KEY);
      else storage.setItem(WINGMAN_STORAGE_KEY, JSON.stringify(slot));
    } catch {
      saved = false;
    }
  }
  publish(slot);
  return saved;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === WINGMAN_STORAGE_KEY || event.key === null) reloadWingmanSlot();
  });
}

/** The chosen aircraft on this device, or null. Re-renders every reader when the choice changes. */
export function useWingmanSlot(): WingmanSlot | null {
  return useSyncExternalStore(subscribe, () => currentState().slot, () => null);
}

/**
 * Side of a flight in the mission view. Matched by object identity only: pilot view keeps the
 * displayed side's flight objects, so a flight of the other side (or a copy that is not the one
 * in `view`) finds no side and stays hidden. A group id match is not used, because a group id
 * can name a flight of the other side.
 */
export function sideOfFlight(view: MissionData, flight: Flight): Side | null {
  if (view.coalitions.blue.flights.includes(flight)) return 'blue';
  if (view.coalitions.red.flights.includes(flight)) return 'red';
  return null;
}

/** Whether the saved choice points at this unit of this flight in the loaded mission. */
export function isWingmanUnit(
  slot: WingmanSlot | null,
  missionKey: string,
  side: Side,
  flight: Flight,
  unitId: number,
): boolean {
  return slot !== null
    && missionKey !== ''
    && slot.missionKey === missionKey
    && slot.flightKey === flightKey(side, flight.groupId)
    && slot.unitId === unitId;
}
