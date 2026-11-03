// Owner: P1 (フライト作業画面). Unsaved flight-note drafts (SPEC 3, 記入). The flight screen unmounts when another
// screen is shown, so a draft held in its state would be lost on every screen change. The drafts are kept here,
// outside the screen, per mission (keyed by sourceFingerprint): a different mission starts with none.
// Drafts are never saved. A page reload or closing the mission clears them.
import type { FlightNotes } from '../../types/mission';
import { emptyFlightNotes } from '../../utils/notes';
import { draftFromFlightNotes } from './flightModel';
import type { FlightNotesDraft, FlightNotesDraftEdits } from './flightModel';

export type NoteDraftMap = Readonly<Record<string, FlightNotesDraftEdits>>;

let owner: string | null = null;
let current: NoteDraftMap = {};
const listeners = new Set<() => void>();

function publish(next: NoteDraftMap): NoteDraftMap {
  current = next;
  for (const listener of listeners) listener();
  return next;
}

/** Calls the listener after every change of the drafts. Returns the unsubscribe function (useSyncExternalStore). */
export function subscribeNoteDrafts(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The drafts of one mission. A mission other than the stored one starts with no drafts. */
export function readNoteDrafts(sourceFingerprint: string): NoteDraftMap {
  if (owner !== sourceFingerprint) {
    owner = sourceFingerprint;
    current = {};
  }
  return current;
}

/** Sets a draft for a flight key, or clears it (null). Returns the drafts after the change. */
export function writeNoteDraft(sourceFingerprint: string, key: string, draft: FlightNotesDraftEdits | null): NoteDraftMap {
  const next: Record<string, FlightNotesDraftEdits> = { ...readNoteDrafts(sourceFingerprint) };
  if (draft) next[key] = draft;
  else delete next[key];
  return publish(next);
}

/**
 * The edits that still differ from the saved values, or null when none does. A field whose draft equals its
 * saved value is dropped, so a later change of that field elsewhere (the notes screen, an import) shows, and
 * 保存 does not write the old draft over it (W1).
 */
export function pendingEdits(edits: FlightNotesDraftEdits | undefined, saved: FlightNotesDraft): FlightNotesDraftEdits | null {
  const pending: FlightNotesDraftEdits = {};
  for (const [field, value] of Object.entries(edits ?? {}) as [keyof FlightNotesDraft, string][]) {
    if (value !== saved[field]) pending[field] = value;
  }
  return Object.keys(pending).length === 0 ? null : pending;
}

/**
 * Drops every draft field that now equals the saved notes (W1). Called whenever the saved notes change, from the
 * mission provider, which stays mounted while the flight screen is not: the saved value can catch up with a draft
 * on the notes screen, and change again before the flight screen is shown.
 */
export function pruneNoteDrafts(sourceFingerprint: string, perFlight: Readonly<Record<string, FlightNotes>>): NoteDraftMap {
  const drafts = readNoteDrafts(sourceFingerprint);
  let changed = false;
  const next: Record<string, FlightNotesDraftEdits> = {};
  for (const [key, edits] of Object.entries(drafts)) {
    const pending = pendingEdits(edits, draftFromFlightNotes(perFlight[key] ?? emptyFlightNotes()));
    if (pending) next[key] = pending;
    if (!pending || Object.keys(pending).length !== Object.keys(edits).length) changed = true;
  }
  return changed ? publish(next) : drafts;
}

/** Drops every draft. Called when the mission is closed, so opening the same file again starts with none (W5). */
export function clearNoteDrafts(): void {
  owner = null;
  publish({});
}
