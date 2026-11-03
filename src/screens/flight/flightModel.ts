// Owner: P1 (フライト作業画面). Pure helpers for the flight screen (no React, no i18n).
// Added beside the contract files so the rules can be tested without rendering.
import type { Flight, FlightNotes, Link16Settings, MissionData, RadioPreset, RoutePoint, Side, WaypointAnnotation } from '../../types/mission';

/** Largest frequency value that is already in MHz. Same rule as the comms screen (CommsTab toMHz). */
const MHZ_THRESHOLD = 1000;
/** Two radios on the same channel count as different when their frequencies differ by more than this (MHz). */
const RADIO_MATCH_TOLERANCE_MHZ = 0.0005;
/** Longest free-text note the notes sidecar accepts (src/utils/notes.ts MAX_NOTE_LENGTH). */
export const MAX_FLIGHT_TEXT_LENGTH = 10000;
export const MAX_FLIGHT_SHORT_TEXT_LENGTH = 80;

export function toMegahertz(value: number): number {
  return Math.abs(value) >= MHZ_THRESHOLD ? value / 1_000_000 : value;
}

export function formatMegahertz(value: number): string {
  return `${toMegahertz(value).toFixed(3)} MHz`;
}

export function formatModulation(modulation: number): 'AM' | 'FM' {
  return modulation === 0 ? 'AM' : 'FM';
}

/** A flight is a Client flight when one of its units is flown by a client or a player (D2). */
export function isClientFlight(flight: Flight): boolean {
  return flight.units.some(unit => {
    const skill = (unit.skill ?? '').toLowerCase();
    return skill === 'client' || skill === 'player';
  });
}

/** Parses a flight key ("blue:12") from the workspace. Anything else is treated as no selection. */
export function parseFlightKey(key: string | null): { side: Side; groupId: number } | null {
  if (!key) return null;
  const match = /^(blue|red):(\d+)$/.exec(key);
  if (!match) return null;
  return { side: match[1] as Side, groupId: Number(match[2]) };
}

/**
 * Finds the selected flight in the view. A key for a flight that the current view
 * does not contain (for example an opposing flight after switching to pilot view)
 * resolves to null, so no data of that flight is shown.
 */
export function findSelectedFlight(view: MissionData, key: string | null): { side: Side; flight: Flight } | null {
  const parsed = parseFlightKey(key);
  if (!parsed) return null;
  const flight = view.coalitions[parsed.side].flights.find(item => item.groupId === parsed.groupId);
  return flight ? { side: parsed.side, flight } : null;
}

/**
 * A route point is positioned unless its latlon is flagged unresolved, is not a finite pair, or is (0, 0).
 * The same (0, 0) rule as the map (MapTab isResolvedLatLon), so no screen draws the origin.
 */
export function isResolvedPoint(point: RoutePoint): boolean {
  if (point.latlonResolved === false) return false;
  if (!Array.isArray(point.latlon) || point.latlon.length !== 2) return false;
  const [lat, lon] = point.latlon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return lat !== 0 || lon !== 0;
}

/** True when a radio of a wingman differs from the lead's radio on the same channel (channel, frequency or modulation). */
export function radioDiffersFromLead(radio: RadioPreset, leadRadios: readonly RadioPreset[]): boolean {
  const lead = leadRadios.find(item => item.channel === radio.channel);
  if (!lead) return true;
  const frequencyDiffers = Math.abs(toMegahertz(lead.frequency) - toMegahertz(radio.frequency)) > RADIO_MATCH_TOLERANCE_MHZ;
  return frequencyDiffers || lead.modulation !== radio.modulation;
}

export function link16DiffersFromLead(link: Link16Settings | undefined, leadLink: Link16Settings | undefined): boolean {
  if (!link) return false;
  if (!leadLink) return true;
  return link.flightLead !== leadLink.flightLead || link.team !== leadLink.team;
}

/** Number of filled annotation fields for one waypoint (purpose and notes, 0 to 2). */
export function annotationFieldCount(annotation: WaypointAnnotation | undefined): number {
  if (!annotation) return 0;
  return (annotation.purpose.trim() ? 1 : 0) + (annotation.notes.trim() ? 1 : 0);
}

/** Text draft of the flight notes form. Fuel stays text until it is validated. */
export interface FlightNotesDraft {
  joker: string;
  bingo: string;
  tot: string;
  pilotName: string;
  customNotes: string;
}

export function draftFromFlightNotes(notes: FlightNotes): FlightNotesDraft {
  return {
    joker: notes.jokerFuel === null ? '' : String(notes.jokerFuel),
    bingo: notes.bingoFuel === null ? '' : String(notes.bingoFuel),
    tot: notes.tot,
    pilotName: notes.pilotName,
    customNotes: notes.customNotes,
  };
}

export type FuelParseResult =
  | { ok: true; value: number | null }
  | { ok: false; reason: 'notNumber' | 'negative' };

/** Empty means "not entered" (null). A negative or non-numeric value is refused, never dropped silently (SPEC 5.1 F13). */
export function parseFuelDraft(text: string): FuelParseResult {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { ok: false, reason: 'notNumber' };
  if (value < 0) return { ok: false, reason: 'negative' };
  return { ok: true, value };
}

export type FlightNotesDraftResult =
  | { ok: true; notes: FlightNotes }
  | { ok: false; joker: FuelParseResult | null; bingo: FuelParseResult | null };

/** Converts the draft to saved notes, or returns the reasons for the fuel fields that are invalid. */
export function flightNotesFromDraft(draft: FlightNotesDraft): FlightNotesDraftResult {
  const joker = parseFuelDraft(draft.joker);
  const bingo = parseFuelDraft(draft.bingo);
  if (!joker.ok || !bingo.ok) {
    return {
      ok: false,
      joker: joker.ok ? null : joker,
      bingo: bingo.ok ? null : bingo,
    };
  }
  return {
    ok: true,
    notes: {
      jokerFuel: joker.value,
      bingoFuel: bingo.value,
      tot: draft.tot.slice(0, MAX_FLIGHT_SHORT_TEXT_LENGTH),
      pilotName: draft.pilotName.slice(0, MAX_FLIGHT_SHORT_TEXT_LENGTH),
      customNotes: draft.customNotes.slice(0, MAX_FLIGHT_TEXT_LENGTH),
    },
  };
}
