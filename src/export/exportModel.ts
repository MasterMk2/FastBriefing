import type { DisplaySettings, MissionData, Side } from '../types/mission';
import type { WhiteboardData } from '../types/whiteboard';
import type { KneeboardPage, KneeboardTranslate } from '../utils/kneeboard';
import { filterWaypointAnnotationsForFlights } from '../utils/waypointAnnotations';
import { planExportPages } from './kneeboardPlan';
import type { ExportFlight, ExportPlan, ExportScope } from './exportPlan';
import { buildExportPlan } from './exportPlan';

export type ExportBlocker = 'noSections' | 'noFlights';

export interface ExportModel {
  plan: ExportPlan;
  /** Every flight of the displayed view (before the scope is applied). */
  allFlights: ExportFlight[];
  /** Flights inside the scope. */
  flights: ExportFlight[];
  aircraftTypes: string[];
  /** Pages in section order. Empty when the plan cannot be exported. */
  pages: KneeboardPage[];
  /** Why the export cannot run, or null. */
  blocker: ExportBlocker | null;
  /** Short label for file names ("all", a side, callsigns, or an aircraft type). */
  label: string;
}

export interface ExportModelInput {
  view: MissionData;
  settings: DisplaySettings;
  side: Side;
  scope: ExportScope;
  whiteboard: WhiteboardData;
}

/** Every flight in the view, in blue, red, neutral order. */
export function listExportFlights(view: MissionData): ExportFlight[] {
  // Neutral flights use the same key form as the notes (side:groupId); flightKey() is typed for Side only.
  const keyOf = (side: Side | 'neutral', groupId: number) => `${side}:${groupId}`;
  return [
    ...view.coalitions.blue.flights.map(flight => ({ key: keyOf('blue', flight.groupId), side: 'blue' as const, flight })),
    ...view.coalitions.red.flights.map(flight => ({ key: keyOf('red', flight.groupId), side: 'red' as const, flight })),
    ...view.coalitions.neutral.flights.map(flight => ({ key: keyOf('neutral', flight.groupId), side: 'neutral' as const, flight })),
  ];
}

/** Applies the export scope to the view's flights. A `flights` scope keeps the order of the view, not of the selection. */
export function selectExportFlights(view: MissionData, scope: ExportScope): ExportFlight[] {
  const all = listExportFlights(view);
  switch (scope.kind) {
    case 'mission':
      return all;
    case 'side':
      return all.filter(item => item.side === scope.side);
    case 'flights': {
      const keys = new Set(scope.flightKeys);
      return all.filter(item => keys.has(item.key));
    }
    case 'aircraft':
      return all.filter(item => item.flight.type === scope.aircraftType);
  }
}

export function aircraftTypesOf(flights: readonly ExportFlight[]): string[] {
  return [...new Set(flights.map(item => item.flight.type).filter(type => /^[A-Za-z0-9_-]+$/.test(type)))].sort();
}

/**
 * Builds the one model that print, PNG, Markdown and the .miz embed all read.
 * The view must already be filtered for the displayed side and view mode (D1).
 */
export function buildExportModel(input: ExportModelInput, t: KneeboardTranslate): ExportModel {
  const plan = buildExportPlan(input.settings, input.scope);
  const allFlights = listExportFlights(input.view);
  const flights = selectExportFlights(input.view, input.scope);
  // The pilot view never prints threats (D1), so a selection of threats alone has nothing to print.
  const printable = plan.viewMode === 'pilot' ? plan.sections.filter(section => section !== 'threats') : plan.sections;
  const blocker: ExportBlocker | null = printable.length === 0
    ? 'noSections'
    : input.scope.kind !== 'mission' && flights.length === 0 ? 'noFlights' : null;
  const pages = blocker === 'noSections'
    ? []
    : planExportPages({
      view: input.view,
      settings: input.settings,
      plan,
      side: input.side,
      flights,
      whiteboard: input.whiteboard,
    }, t);
  return {
    plan,
    allFlights,
    flights,
    aircraftTypes: aircraftTypesOf(allFlights),
    pages,
    blocker,
    label: scopeLabel(input.scope, flights),
  };
}

/** Short label for file names: no user paths, only the scope. */
export function scopeLabel(scope: ExportScope, flights: readonly ExportFlight[]): string {
  switch (scope.kind) {
    case 'mission':
      return 'mission';
    case 'side':
      return scope.side;
    case 'flights':
      return flights.map(item => item.flight.callsign || item.flight.name).join('+') || 'flights';
    case 'aircraft':
      return scope.aircraftType;
  }
}

/** Replaces characters Windows does not allow in file names, and trims the result. */
export function safeFileStem(value: string, fallback = 'briefing'): string {
  const stem = Array.from(value)
    .map(character => (character.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(character) ? '_' : character))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return stem || fallback;
}

/** `<sortie>-<label>-kneeboard.zip`, FR-86 (no user name or path). */
export function kneeboardZipName(sortie: string, label: string): string {
  return `${safeFileStem(sortie)}-${safeFileStem(label, 'all')}-kneeboard.zip`;
}

/** `<mission file>-<label>-kneeboard.miz`, using the source file name without its extension. */
export function kneeboardMizName(sourceName: string, label: string): string {
  return `${safeFileStem(sourceName.replace(/\.miz$/i, ''))}-${safeFileStem(label, 'all')}-kneeboard.miz`;
}

export function markdownFileName(sortie: string, label: string): string {
  return `${safeFileStem(sortie)}-${safeFileStem(label, 'all')}-briefing.md`;
}

/**
 * The normalized mission JSON for the advanced card. Pilot view keeps only the
 * displayed side's flights in the notes (the same rule as before the refactor).
 */
export function normalizedMissionJson(view: MissionData, viewMode: DisplaySettings['viewMode']): MissionData {
  if (viewMode === 'creator') return view;
  const visibleFlights = new Set(listExportFlights(view).map(item => item.key));
  return {
    ...view,
    userNotes: {
      ...view.userNotes,
      perFlight: Object.fromEntries(Object.entries(view.userNotes.perFlight).filter(([key]) => visibleFlights.has(key))),
      waypoints: filterWaypointAnnotationsForFlights(view.userNotes.waypoints, visibleFlights),
    },
  };
}
