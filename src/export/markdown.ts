import type { KneeboardPage, KneeboardSection, KneeboardTranslate } from '../utils/kneeboard';

export type MarkdownStyle = 'table' | 'code';

export interface MarkdownOptions {
  /** The mission name, used as the top heading. */
  title: string;
  /** "作成者" or "パイロット" label, already translated. */
  viewLabel: string;
  style: MarkdownStyle;
}

/**
 * Markdown for chat tools such as Discord (SPEC 1.3, F9, D8). It is written from the
 * same pages as the print and PNG output, so a section never differs between formats.
 * `table` writes navigation tables as Markdown tables; `code` puts every section in a
 * monospaced block, which keeps columns aligned where tables do not render.
 */
export function renderMarkdown(
  pages: readonly KneeboardPage[],
  options: MarkdownOptions,
  t: KneeboardTranslate,
): string {
  const blocks: string[] = [`# ${options.title || t('export:label.notAvailable')}`, `_${options.viewLabel}_`];
  for (const page of pages) {
    blocks.push(pageMarkdown(page, options.style, t));
  }
  return `${blocks.join('\n\n')}\n`;
}

function pageMarkdown(page: KneeboardPage, style: MarkdownStyle, t: KneeboardTranslate): string {
  if (page.kind === 'map') {
    return [`## ${page.title}`, `- ${t('export:label.mapNote', { theatre: page.scene.theatre })}`].join('\n\n');
  }
  if (page.kind === 'whiteboard') {
    const notes = page.data.notes.trim();
    const drawing = page.data.strokes.length
      ? `_${t('export:label.whiteboardDrawing', { count: page.data.strokes.length })}_`
      : '';
    return [`## ${page.title}`, notes || `_${t('export:label.noNotes')}_`, drawing].filter(Boolean).join('\n\n');
  }
  return [`## ${page.title}`, ...page.sections.map(section => sectionMarkdown(section, style))].join('\n\n');
}

function sectionMarkdown(section: KneeboardSection, style: MarkdownStyle): string {
  const body: string[] = [];
  if (section.table && style === 'table') {
    body.push(tableMarkdown(section.table.header, section.table.rows));
  } else if (style === 'table') {
    body.push(section.lines.map(line => `- ${line}`).join('\n'));
  } else {
    const lines = section.table ? [section.table.header.join('  '), ...section.table.rows.map(row => row.join('  '))] : section.lines;
    const fence = codeFence(lines);
    body.push([`${fence}text`, ...lines, fence].join('\n'));
  }
  return [`### ${section.heading}`, ...body].filter(Boolean).join('\n\n');
}

/** A fence longer than any backtick run in the content, so a memo with ``` cannot close the block early. */
function codeFence(lines: readonly string[]): string {
  const longest = lines.reduce((max, line) => Math.max(max, ...(line.match(/`+/g) ?? []).map(run => run.length)), 0);
  return '`'.repeat(Math.max(3, longest + 1));
}

function tableMarkdown(header: readonly string[], rows: readonly string[][]): string {
  const cell = (value: string) => value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  return [
    `| ${header.map(cell).join(' | ')} |`,
    `|${header.map(() => '---').join('|')}|`,
    ...rows.map(row => `| ${row.map(cell).join(' | ')} |`),
  ].join('\n');
}
