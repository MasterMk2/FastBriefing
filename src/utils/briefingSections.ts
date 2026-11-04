/**
 * Sections of the printed and exported briefing material, in the SPEC 6.2 order.
 * `whiteboard` was merged into `notes` (the whiteboard is printed with the notes),
 * and `weather` and `route` split off from `overview` and `flights`.
 */
export const BRIEFING_SECTIONS = [
  'overview',
  'weather',
  'flights',
  'route',
  'comms',
  'support',
  'threats',
  'map',
  'notes',
] as const;

export type BriefingSection = typeof BRIEFING_SECTIONS[number];
/** SPEC 6.2 name for the same type. */
export type BriefingSectionId = BriefingSection;

export interface BriefingPreset {
  name: string;
  sections: BriefingSection[];
}

export const MAX_BRIEFING_PRESETS = 20;
export const MAX_BRIEFING_PRESET_NAME_LENGTH = 40;

export const DEFAULT_BRIEFING_SECTIONS: readonly BriefingSection[] = BRIEFING_SECTIONS;

export function isBriefingSection(value: unknown): value is BriefingSection {
  return typeof value === 'string' && BRIEFING_SECTIONS.includes(value as BriefingSection);
}

/**
 * Keeps known sections in the user's order and drops duplicates and unknown values.
 * The retired `whiteboard` id maps to `notes`, which is idempotent: the mapped value
 * is never mapped again, so repeated normalization gives the same result.
 */
export function normalizeBriefingSections(value: unknown): BriefingSection[] {
  if (!Array.isArray(value)) return [...DEFAULT_BRIEFING_SECTIONS];

  const selected = new Set<BriefingSection>();
  for (const candidate of value) {
    const mapped = candidate === 'whiteboard' ? 'notes' : candidate;
    if (isBriefingSection(mapped)) selected.add(mapped);
  }
  return [...selected];
}

/**
 * One-time migration for settings saved before v5 (schema 4 and earlier). Before v5,
 * `overview` printed the weather too, and `flights` printed the nav logs, which are now
 * the `weather` and `route` sections. A user who had `overview` selected gets `weather`
 * right after it, and a user who had `flights` selected gets `route` right after it, so
 * the printed output does not lose that material. Anything else is left as the user
 * chose it. Call once, from the pre-v5 migrations only; it must not run on every
 * normalization (it would stop a user from deselecting `weather` or `route`).
 */
export function migrateLegacyBriefingSections(value: unknown): BriefingSection[] {
  const sections = normalizeBriefingSections(value);
  if (sections.includes('overview') && !sections.includes('weather')) {
    const overviewIndex = sections.indexOf('overview');
    sections.splice(overviewIndex + 1, 0, 'weather');
  }
  if (!sections.includes('flights') || sections.includes('route')) return sections;
  const index = sections.indexOf('flights');
  return [...sections.slice(0, index + 1), 'route', ...sections.slice(index + 1)];
}

export function normalizeBriefingPresetName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return Array.from(value.trim()).slice(0, MAX_BRIEFING_PRESET_NAME_LENGTH).join('');
}

export function normalizeBriefingPresets(value: unknown): BriefingPreset[] {
  if (!Array.isArray(value)) return [];

  const presets: BriefingPreset[] = [];
  const names = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) continue;
    const record = candidate as Record<string, unknown>;
    const name = normalizeBriefingPresetName(record.name);
    const key = name.toLowerCase();
    if (!name || names.has(key) || !Array.isArray(record.sections)) continue;
    names.add(key);
    presets.push({ name, sections: normalizeBriefingSections(record.sections) });
    if (presets.length >= MAX_BRIEFING_PRESETS) break;
  }
  return presets;
}

export function moveBriefingSection(
  sections: readonly BriefingSection[],
  section: BriefingSection,
  targetIndex: number,
): BriefingSection[] {
  const normalized = normalizeBriefingSections(sections);
  const currentIndex = normalized.indexOf(section);
  if (currentIndex < 0) return normalized;
  const next = [...normalized];
  next.splice(currentIndex, 1);
  const boundedIndex = Math.max(0, Math.min(targetIndex, next.length));
  next.splice(boundedIndex, 0, section);
  return next;
}

export function hasBriefingSection(
  sections: readonly BriefingSection[],
  section: BriefingSection,
): boolean {
  return sections.includes(section);
}
