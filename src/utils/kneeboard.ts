import type { WhiteboardData } from '../types/whiteboard';
import type { BriefingSection } from './briefingSections';
import type { MissionMapScene } from './missionMapRaster';

/**
 * The page types that every output reads (print, PNG, Markdown and the .miz embed). The pages are
 * planned by `planExportPages` (src/export/kneeboardPlan.ts); this file holds only the shared types.
 */
export interface KneeboardSection {
  heading: string;
  /** Plain text fallback (used by the PNG renderer). Table rows are also written here as text. */
  lines: string[];
  /** Optional table for Markdown and print (P3). */
  table?: { header: string[]; rows: string[][] };
  /**
   * The lines are free text written by the mission author or the user (the mission description, a task text, a
   * memo): every output keeps them as written, with their blank lines and the spaces that line up columns.
   * Markdown fences them, the print keeps the white space, and the PNG draws them in a monospaced font.
   */
  preformatted?: boolean;
}

/** A map pin the user placed on the map (label and memo), listed under the map in print and Markdown. */
export interface KneeboardMapPin {
  label: string;
  notes: string;
}

export type KneeboardPage =
  | { kind: 'text'; section: BriefingSection; title: string; sections: KneeboardSection[] }
  | { kind: 'map'; section: 'map'; title: string; scene: MissionMapScene; pins: KneeboardMapPin[] }
  | { kind: 'whiteboard'; section: 'notes'; title: string; data: WhiteboardData };

export type KneeboardTranslate = (key: string, options?: Record<string, string | number>) => string;
