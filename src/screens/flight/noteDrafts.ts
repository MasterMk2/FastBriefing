// Owner: P1 (フライト作業画面). Unsaved flight-note drafts (SPEC 3, 記入). The flight screen unmounts when another
// screen is shown, so a draft held in its state would be lost on every screen change. The drafts are kept here,
// outside the screen, per mission (keyed by sourceFingerprint): a different mission starts with none.
// Drafts are never saved. A page reload or closing the mission clears them.
import type { FlightNotesDraftEdits } from './flightModel';

export type NoteDraftMap = Readonly<Record<string, FlightNotesDraftEdits>>;

let owner: string | null = null;
let current: NoteDraftMap = {};

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
  current = next;
  return next;
}

/** Drops every draft. Called when the mission is closed, so opening the same file again starts with none (W5). */
export function clearNoteDrafts(): void {
  owner = null;
  current = {};
}
