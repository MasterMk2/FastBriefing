import type { KneeboardMapPin, KneeboardPage, KneeboardSection, KneeboardTranslate } from '../utils/kneeboard';
import { pinLine } from './kneeboardPlan';

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
    const blocks = [`## ${page.title}`, `- ${t('export:label.mapNote', { theatre: page.scene.theatre })}`];
    if (page.pins.length > 0) blocks.push(pinsMarkdown(page.pins, style, t));
    return blocks.join('\n\n');
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
    const lines = section.table ? alignedTableLines(section.table.header, section.table.rows) : section.lines;
    const fence = codeFence(lines);
    body.push([`${fence}text`, ...lines, fence].join('\n'));
  }
  return [`### ${section.heading}`, ...body].filter(Boolean).join('\n\n');
}

/**
 * The map pins as "**label**: memo" items (the form of the old Markdown output). In code style they go in a
 * fenced block as "label: memo", the same as every other section.
 */
function pinsMarkdown(pins: readonly KneeboardMapPin[], style: MarkdownStyle, t: KneeboardTranslate): string {
  const heading = `### ${t('export:label.mapPins')}`;
  if (style === 'code') {
    const lines = pins.map(pinLine);
    const fence = codeFence(lines);
    return [heading, [`${fence}text`, ...lines, fence].join('\n')].join('\n\n');
  }
  const inline = (value: string) => value.replace(/\s*\r?\n\s*/g, ' / ').replace(/([\\*_`[\]])/g, '\\$1');
  const items = pins.map(pin => `- **${inline(pin.label)}**: ${inline(pin.notes || t('export:label.notAvailable'))}`);
  return [heading, items.join('\n')].join('\n\n');
}

/**
 * A table as monospaced lines: every cell is padded to the widest cell of its column, so the columns line up in a
 * code block. Wide characters (CJK, full-width forms) count as two columns, as a monospaced font draws them.
 */
export function alignedTableLines(header: readonly string[], rows: readonly string[][]): string[] {
  const all = [header, ...rows];
  const columns = Math.max(...all.map(row => row.length));
  const widths = Array.from({ length: columns }, (_, column) => Math.max(...all.map(row => displayWidth(row[column] ?? ''))));
  return all.map(row => widths
    .map((width, column) => {
      const cell = (row[column] ?? '').replace(/\r?\n/g, ' ');
      return column === columns - 1 ? cell : cell + ' '.repeat(width - displayWidth(cell));
    })
    .join('  ')
    .trimEnd());
}

/** Columns a string takes in a monospaced font: East Asian wide and full-width characters take two. */
export function displayWidth(value: string): number {
  let width = 0;
  for (const character of value) width += isWide(character.codePointAt(0) ?? 0) ? 2 : 1;
  return width;
}

function isWide(code: number): boolean {
  return (code >= 0x1100 && code <= 0x115f)
    || (code >= 0x2e80 && code <= 0x303e)
    || (code >= 0x3041 && code <= 0x33ff)
    || (code >= 0x3400 && code <= 0x4dbf)
    || (code >= 0x4e00 && code <= 0x9fff)
    || (code >= 0xa000 && code <= 0xa4cf)
    || (code >= 0xac00 && code <= 0xd7a3)
    || (code >= 0xf900 && code <= 0xfaff)
    || (code >= 0xfe30 && code <= 0xfe4f)
    || (code >= 0xff00 && code <= 0xff60)
    || (code >= 0xffe0 && code <= 0xffe6)
    || (code >= 0x20000 && code <= 0x3fffd);
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
