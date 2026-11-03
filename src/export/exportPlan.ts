import { useSyncExternalStore } from 'react';
import type { BriefingSection } from '../utils/briefingSections';
import type { DisplaySettings, Flight, Side } from '../types/mission';

/**
 * What the export covers (P3). The scope is chosen on the export screen, or set
 * by another screen (for example "この資料を作る" on a flight) before opening it.
 */
export type ExportScope =
  | { kind: 'mission' }
  | { kind: 'side'; side: Side }
  | { kind: 'flights'; flightKeys: string[] }
  | { kind: 'aircraft'; aircraftType: string };

export interface ExportPlan {
  viewMode: DisplaySettings['viewMode'];
  outputLanguage: DisplaySettings['outputLanguage'];
  sections: BriefingSection[];
  scope: ExportScope;
  kneeboardWidth: DisplaySettings['kneeboardWidth'];
}

/** One flight of the displayed view, with the coalition it belongs to. `key` is flightKey(side, groupId). */
export interface ExportFlight {
  key: string;
  side: Side | 'neutral';
  flight: Flight;
}

const ALL_MISSION: ExportScope = { kind: 'mission' };

/**
 * The scope is shared state (not component state), so the printed document, the
 * export screen and the flight screen's "この資料を作る" all read the same plan.
 * It is keyed by the mission fingerprint: a different mission starts from the
 * whole mission again, and the scope is not written to storage.
 */
interface ScopeRecord {
  key: string;
  scope: ExportScope;
}

let record: ScopeRecord = { key: '', scope: ALL_MISSION };
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Sets the export scope for the mission identified by `missionKey` (its sourceFingerprint). */
export function setExportScope(missionKey: string, scope: ExportScope): void {
  record = { key: missionKey, scope };
  notify();
}

/** Reads the scope for one mission. A different mission always gets the whole-mission scope. */
export function readExportScope(missionKey: string): ExportScope {
  return record.key === missionKey ? record.scope : ALL_MISSION;
}

export function useExportScope(missionKey: string): ExportScope {
  return useSyncExternalStore(
    subscribe,
    () => readExportScope(missionKey),
    () => ALL_MISSION,
  );
}

/** Clears the shared scope. Used by tests and when a mission is closed. */
export function resetExportScope(): void {
  record = { key: '', scope: ALL_MISSION };
  notify();
}

/** Builds the plan for a render. The view mode and output language come from settings, not from the screen. */
export function buildExportPlan(settings: DisplaySettings, scope: ExportScope): ExportPlan {
  return {
    viewMode: settings.viewMode,
    outputLanguage: settings.outputLanguage,
    sections: [...settings.briefingSections],
    scope,
    kneeboardWidth: settings.kneeboardWidth,
  };
}
