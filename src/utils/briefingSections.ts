export const BRIEFING_SECTIONS = [
  'overview',
  'flights',
  'map',
  'comms',
  'support',
  'threats',
  'whiteboard',
] as const;

export type BriefingSection = typeof BRIEFING_SECTIONS[number];

export const DEFAULT_BRIEFING_SECTIONS: readonly BriefingSection[] = BRIEFING_SECTIONS;

export function isBriefingSection(value: unknown): value is BriefingSection {
  return typeof value === 'string' && BRIEFING_SECTIONS.includes(value as BriefingSection);
}

export function normalizeBriefingSections(value: unknown): BriefingSection[] {
  if (!Array.isArray(value)) return [...DEFAULT_BRIEFING_SECTIONS];

  const selected = new Set(value.filter(isBriefingSection));
  return BRIEFING_SECTIONS.filter(section => selected.has(section));
}

export function hasBriefingSection(
  sections: readonly BriefingSection[],
  section: BriefingSection,
): boolean {
  return sections.includes(section);
}
