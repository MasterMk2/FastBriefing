export const BRIEFING_SECTIONS = [
  'overview',
  'notes',
  'flights',
  'map',
  'comms',
  'support',
  'threats',
  'whiteboard',
] as const;

export type BriefingSection = typeof BRIEFING_SECTIONS[number];

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

export function normalizeBriefingSections(value: unknown): BriefingSection[] {
  if (!Array.isArray(value)) return [...DEFAULT_BRIEFING_SECTIONS];

  const selected = new Set<BriefingSection>();
  for (const candidate of value) {
    if (isBriefingSection(candidate)) selected.add(candidate);
  }
  return [...selected];
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
