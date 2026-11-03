// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../hooks/useSettings';
import type { DisplaySettings, MissionData } from '../types/mission';
import type { KneeboardPage, KneeboardSection } from '../utils/kneeboard';
import { applyViewMode } from '../utils/viewMode';
import { buildExportModel } from './exportModel';
import { renderMarkdown, type MarkdownStyle } from './markdown';
import PrintDocument from './printDocument';
import { fixtureMission } from './__tests__/fixture';

// The mission description, the task text, SMEAC and the free memos are free text: their line breaks, blank lines
// and the spaces that line up columns are kept as written in every output (Markdown, print and PNG). The print
// style sheet is checked in src/screens/reviewStyles.test.ts, the PNG drawing in src/utils/kneeboardRenderer.test.ts.

const t = (key: string) => key;

/** A description like the one of sample.miz: a title, a ==== rule, columns lined up with spaces, blank lines. */
const DESCRIPTION = [
  '',
  '   OPERATION COLCHIS SHIELD',
  '==========================',
  'CALLSIGN   FREQ     ROLE',
  'Viper 1    251.000  CAP',
  '',
  'Use ```code``` sparingly',
  '',
].join('\r\n');

const DESCRIPTION_LINES = [
  '   OPERATION COLCHIS SHIELD',
  '==========================',
  'CALLSIGN   FREQ     ROLE',
  'Viper 1    251.000  CAP',
  '',
  'Use ```code``` sparingly',
];

function pagesFor(mutate: (mission: MissionData) => void, settings: Partial<DisplaySettings> = {}, notes = ''): KneeboardPage[] {
  const mission = fixtureMission();
  mutate(mission);
  const full: DisplaySettings = { ...DEFAULT_SETTINGS, viewMode: 'pilot', side: 'blue', briefingSections: ['overview'], ...settings };
  const view = applyViewMode(mission, full.viewMode, 'blue');
  return buildExportModel({ view, settings: full, side: 'blue', scope: { kind: 'mission' }, whiteboard: { notes, strokes: [] } }, t).pages;
}

function sectionsOf(pages: readonly KneeboardPage[]): KneeboardSection[] {
  return pages.flatMap(page => (page.kind === 'text' ? page.sections : []));
}

function markdown(pages: readonly KneeboardPage[], style: MarkdownStyle): string {
  return renderMarkdown(pages, { title: 'T', viewLabel: 'pilot', style }, t);
}

describe('the mission description is one free-text block', () => {
  const pages = () => pagesFor(mission => { mission.meta.description = DESCRIPTION; });

  it('gets its own section, kept as written, apart from the mission facts', () => {
    const sections = sectionsOf(pages());
    const description = sections.find(section => section.heading === 'export:label.description');
    expect(description?.preformatted).toBe(true);
    expect(description?.lines).toEqual(DESCRIPTION_LINES);
    const mission = sections.find(section => section.heading === 'export:label.mission');
    expect(mission?.lines.join('\n')).not.toContain('CALLSIGN');
  });

  it.each<MarkdownStyle>(['table', 'code'])('is a fenced block without a language in %s style, never a list', style => {
    const text = markdown(pages(), style);
    // The content has a ``` run, so the fence is four backticks long and the block cannot close early.
    expect(text).toContain(`### export:label.description\n\n\`\`\`\`\n${DESCRIPTION_LINES.join('\n')}\n\`\`\`\`\n`);
    expect(text).not.toContain('- CALLSIGN');
    expect(text).not.toContain('- ====');
    expect(text.split('\n')).not.toContain('- ');
  });

  it('uses a three-backtick fence when the text has no backticks', () => {
    const text = markdown(pagesFor(mission => { mission.meta.description = 'A    B\n\nC'; }), 'table');
    expect(text).toContain('### export:label.description\n\n```\nA    B\n\nC\n```');
  });

  it('prints as preformatted text, so the spaces and blank lines stay', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    try {
      await act(async () => {
        root.render(<PrintDocument pages={pages()} title="T" viewLabel="pilot" t={t} drawMaps={false} />);
      });
      const block = Array.from(container.querySelectorAll('pre.print-pre'))
        .find(element => element.textContent?.includes('CALLSIGN'));
      expect(block?.textContent).toBe(DESCRIPTION_LINES.join('\n'));
      const items = Array.from(container.querySelectorAll('li')).map(item => item.textContent ?? '');
      expect(items.some(item => item.includes('CALLSIGN'))).toBe(false);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});

describe('the other free texts are fenced blocks too', () => {
  it('writes a multi-line task text as a block', () => {
    const pages = pagesFor(mission => { mission.meta.descriptionBlueTask = 'Line 1\n  indented\n\nLine 3'; });
    const task = sectionsOf(pages).find(section => section.heading === 'export:label.task');
    expect(task).toMatchObject({ preformatted: true, lines: ['Line 1', '  indented', '', 'Line 3'] });
    expect(markdown(pages, 'table')).toContain('```\nLine 1\n  indented\n\nLine 3\n```');
  });

  it('writes the SMEAC fields and a flight memo as blocks', () => {
    const pages = pagesFor(mission => {
      mission.userNotes.smeac.situation = 'Threat   High\nWeather  Low';
      mission.userNotes.perFlight['blue:1'].customNotes = 'Fence  in\n\nlater';
    }, { briefingSections: ['flights', 'notes'] });
    const sections = sectionsOf(pages);
    const situation = sections.find(section => section.heading === 'export:label.smeac.situation');
    expect(situation).toMatchObject({ preformatted: true, lines: ['Threat   High', 'Weather  Low'] });
    const memos = sections.filter(section => section.lines.join('\n') === 'Fence  in\n\nlater');
    // One on the flight list, one on the notes page; both kept as written.
    expect(memos).toHaveLength(2);
    expect(memos.every(section => section.preformatted)).toBe(true);
    const text = markdown(pages, 'table');
    expect(text).toContain('```\nThreat   High\nWeather  Low\n```');
    expect(text).not.toContain('- Fence  in');
  });

  it('writes the whiteboard notes as a block, so single line breaks survive in Markdown', () => {
    const pages = pagesFor(() => {}, { briefingSections: ['notes'] }, 'Row 1   A\nRow 2   B');
    expect(markdown(pages, 'table')).toContain('```\nRow 1   A\nRow 2   B\n```');
  });
});
