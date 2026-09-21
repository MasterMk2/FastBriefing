import type { KneeboardPage, KneeboardTranslate } from './kneeboard';
import { WHITEBOARD_HEIGHT, WHITEBOARD_WIDTH } from '../hooks/useWhiteboard';
import { drawMissionMap } from './missionMapRaster';

const BASE_WIDTH = 1536;
const BASE_HEIGHT = 2048;
const MARGIN = 96;
const CONTENT_BOTTOM = 1870;
const TEXT_LINE_HEIGHT = 48;
const ESTIMATED_CHARS_PER_LINE = 40;
export const MAX_KNEEBOARD_PAGES = 64;
export const MAX_KNEEBOARD_PIXELS = 128_000_000;

interface CanvasPage {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
}

interface TextCommand {
  kind: 'heading' | 'line';
  text: string;
  y: number;
}

type PhysicalPage =
  | { kind: 'text'; title: string; commands: TextCommand[] }
  | { kind: 'map'; title: string; page: Extract<KneeboardPage, { kind: 'map' }> }
  | { kind: 'whiteboard'; title: string; page: Extract<KneeboardPage, { kind: 'whiteboard' }>; noteLines: string[] };

export async function renderKneeboardPages(
  pages: KneeboardPage[],
  width: number,
  t: KneeboardTranslate,
): Promise<Uint8Array[]> {
  if (!Number.isInteger(width) || width % 3 !== 0 || width < 768 || width > 3072) {
    throw new Error(t('kneeboard.invalidWidth'));
  }

  // Reject obviously excessive work before allocating even a single full-size canvas.
  assertKneeboardRenderBudget(estimateKneeboardPageCount(pages), width, t);
  const measurementCanvas = document.createElement('canvas');
  measurementCanvas.width = 1;
  measurementCanvas.height = 1;
  const measurementContext = measurementCanvas.getContext('2d');
  if (!measurementContext) throw new Error('Canvas 2D context unavailable');
  measurementContext.font = '32px sans-serif';
  const physicalPages = paginatePages(pages, t, measurementContext);
  measurementCanvas.width = 1;
  measurementCanvas.height = 1;
  assertKneeboardRenderBudget(physicalPages.length, width, t);

  const output: Uint8Array[] = [];
  const batchSize = width > 2048 ? 1 : 2;
  for (let batchStart = 0; batchStart < physicalPages.length; batchStart += batchSize) {
    const encodings: Promise<Uint8Array>[] = [];
    for (let index = batchStart; index < Math.min(batchStart + batchSize, physicalPages.length); index += 1) {
      const spec = physicalPages[index];
      const current = createPage(spec.title, width);
      try {
        if (spec.kind === 'text') renderTextCommands(current.context, spec.commands);
        else if (spec.kind === 'map') await renderMapPage(spec.page, current.context, t);
        else renderWhiteboardPage(spec.page, spec.noteLines, current.context);

        current.context.fillStyle = '#526176';
        current.context.font = '26px sans-serif';
        current.context.textAlign = 'right';
        current.context.fillText(`${index + 1} / ${physicalPages.length}`, BASE_WIDTH - MARGIN, BASE_HEIGHT - 64);
      } catch (error) {
        current.canvas.width = 1;
        current.canvas.height = 1;
        throw error;
      }
      encodings.push(canvasToPng(current.canvas)
        .then(async blob => new Uint8Array(await blob.arrayBuffer()))
        .finally(() => {
          // Keep at most two raw RGBA backing stores, and only one at widths above
          // 2048 px, then release them before the next bounded batch.
          current.canvas.width = 1;
          current.canvas.height = 1;
        }));
    }
    output.push(...await Promise.all(encodings));
  }
  return output;
}

export function assertKneeboardRenderBudget(
  pageCount: number,
  width: number,
  t: KneeboardTranslate,
): void {
  if (pageCount > MAX_KNEEBOARD_PAGES) {
    throw new Error(t('kneeboard.tooManyPages', { count: pageCount, limit: MAX_KNEEBOARD_PAGES }));
  }
  const height = Math.round(width * 4 / 3);
  const pixels = pageCount * width * height;
  if (!Number.isSafeInteger(pixels) || pixels > MAX_KNEEBOARD_PIXELS) {
    const limit = Math.floor(MAX_KNEEBOARD_PIXELS / (width * height));
    throw new Error(t('kneeboard.tooManyPixels', { count: pageCount, limit }));
  }
}

export function estimateKneeboardPageCount(pages: readonly KneeboardPage[]): number {
  return pages.reduce((total, page) => {
    if (page.kind === 'map') return total + 1;
    if (page.kind === 'whiteboard' && page.data.strokes.length > 0) {
      const noteLines = estimateWrappedLines(page.data.notes);
      return total + 1 + Math.ceil(Math.max(0, noteLines - 7) / 31);
    }
    const sections = page.kind === 'text'
      ? page.sections
      : [{ heading: '', lines: page.data.notes ? page.data.notes.split(/\r?\n/) : [''] }];
    const height = sections.reduce((sum, section) => sum + 86
      + section.lines.reduce((lineSum, line) => lineSum + estimateWrappedLines(line) * TEXT_LINE_HEIGHT, 0), 0);
    return total + Math.max(1, Math.ceil(height / (CONTENT_BOTTOM - 240)));
  }, 0);
}

function estimateWrappedLines(value: string): number {
  return value.split(/\r?\n/).reduce(
    (sum, line) => sum + Math.max(1, Math.ceil(Array.from(line).length / ESTIMATED_CHARS_PER_LINE)),
    0,
  );
}

function paginatePages(
  pages: KneeboardPage[],
  t: KneeboardTranslate,
  context: CanvasRenderingContext2D,
): PhysicalPage[] {
  const result: PhysicalPage[] = [];
  for (const page of pages) {
    if (page.kind === 'text') {
      result.push(...paginateTextPage(page, t, context));
    } else if (page.kind === 'map') {
      result.push({ kind: 'map', title: page.title, page });
    } else if (page.data.strokes.length === 0) {
      result.push(...paginateTextPage({
        kind: 'text',
        section: 'whiteboard',
        title: page.title,
        sections: [{
          heading: t('whiteboard.notes'),
          lines: page.data.notes ? page.data.notes.split(/\r?\n/) : [t('export.markdown.noWhiteboardNotes')],
        }],
      }, t, context));
    } else {
      context.font = '32px sans-serif';
      const wrappedNotes = page.data.notes
        .split(/\r?\n/)
        .flatMap(line => wrapLine(context, line, BASE_WIDTH - MARGIN * 2));
      result.push({ kind: 'whiteboard', title: page.title, page, noteLines: wrappedNotes.slice(0, 7) });
      const overflow = wrappedNotes.slice(7);
      if (overflow.length > 0) {
        result.push(...paginateTextPage({
          kind: 'text',
          section: 'whiteboard',
          title: `${page.title} (${t('kneeboard.continued')})`,
          sections: [{ heading: t('whiteboard.notes'), lines: overflow }],
        }, t, context));
      }
    }
  }
  return result;
}

function paginateTextPage(
  page: Extract<KneeboardPage, { kind: 'text' }>,
  t: KneeboardTranslate,
  context: CanvasRenderingContext2D,
): PhysicalPage[] {
  const pages: PhysicalPage[] = [];
  let commands: TextCommand[] = [];
  let title = page.title;
  let y = 240;
  const nextPage = () => {
    pages.push({ kind: 'text', title, commands });
    title = `${page.title} (${t('kneeboard.continued')})`;
    commands = [];
    y = 240;
  };

  for (const section of page.sections) {
    if (y + 110 > CONTENT_BOTTOM) nextPage();
    commands.push({ kind: 'heading', text: section.heading, y });
    y += 64;
    context.font = '32px sans-serif';
    for (const sourceLine of section.lines) {
      for (const line of wrapLine(context, sourceLine, BASE_WIDTH - MARGIN * 2)) {
        if (y + TEXT_LINE_HEIGHT > CONTENT_BOTTOM) nextPage();
        commands.push({ kind: 'line', text: line, y });
        y += TEXT_LINE_HEIGHT;
      }
    }
    y += 22;
  }
  pages.push({ kind: 'text', title, commands });
  return pages;
}

function createPage(title: string, width: number): CanvasPage {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round(width * 4 / 3);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable');
  context.scale(width / BASE_WIDTH, canvas.height / BASE_HEIGHT);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
  context.fillStyle = '#17324f';
  context.fillRect(0, 0, BASE_WIDTH, 22);
  context.font = 'bold 58px sans-serif';
  context.textAlign = 'left';
  context.fillText(title, MARGIN, 130, BASE_WIDTH - MARGIN * 2);
  context.strokeStyle = '#b9c8d8';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(MARGIN, 165);
  context.lineTo(BASE_WIDTH - MARGIN, 165);
  context.stroke();
  return { canvas, context };
}

function renderTextCommands(context: CanvasRenderingContext2D, commands: TextCommand[]): void {
  for (const command of commands) {
    context.font = command.kind === 'heading' ? 'bold 38px sans-serif' : '32px sans-serif';
    context.fillStyle = command.kind === 'heading' ? '#17324f' : '#1e2936';
    context.fillText(command.text, MARGIN, command.y, BASE_WIDTH - MARGIN * 2);
  }
}

function wrapLine(context: CanvasRenderingContext2D, value: string, maxWidth: number): string[] {
  if (!value) return [''];
  const lines: string[] = [];
  let line = '';
  for (const character of value) {
    const next = line + character;
    if (line && context.measureText(next).width > maxWidth) {
      lines.push(line);
      line = character;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function renderMapPage(
  page: Extract<KneeboardPage, { kind: 'map' }>,
  context: CanvasRenderingContext2D,
  t: KneeboardTranslate,
): Promise<void> {
  const mapLeft = MARGIN + 40;
  const mapTop = 220;
  const mapWidth = BASE_WIDTH - (MARGIN + 40) * 2;
  const mapHeight = 1580;
  const rendered = await drawMissionMap(context, page.scene, mapLeft, mapTop, mapWidth, mapHeight, {
    empty: t('kneeboard.noMap'),
    basemapUnavailable: t('mapRaster.basemapUnavailable'),
    routes: t('mapRaster.routes'),
    support: t('mapRaster.support'),
    threats: t('mapRaster.threats'),
    zones: t('mapRaster.zones'),
  });
  if (!rendered && page.scene.routes.length + page.scene.zones.length + page.scene.drawings.length > 0) {
    throw new Error(t('kneeboard.basemapUnavailable'));
  }
}

function renderWhiteboardPage(
  page: Extract<KneeboardPage, { kind: 'whiteboard' }>,
  noteLines: string[],
  context: CanvasRenderingContext2D,
): void {
  context.font = '32px sans-serif';
  context.fillStyle = '#1e2936';
  let y = 230;
  for (const line of noteLines) {
    context.fillText(line, MARGIN, y);
    y += TEXT_LINE_HEIGHT;
  }

  const boardTop = 620;
  const boardWidth = BASE_WIDTH - MARGIN * 2;
  const boardHeight = boardWidth * WHITEBOARD_HEIGHT / WHITEBOARD_WIDTH;
  context.fillStyle = '#ffffff';
  context.fillRect(MARGIN, boardTop, boardWidth, boardHeight);
  context.strokeStyle = '#98a2b3';
  context.lineWidth = 3;
  context.strokeRect(MARGIN, boardTop, boardWidth, boardHeight);
  const scale = boardWidth / WHITEBOARD_WIDTH;
  for (const stroke of page.data.strokes) {
    if (stroke.points.length === 0) continue;
    context.strokeStyle = stroke.color;
    context.lineWidth = stroke.width * scale;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(MARGIN + stroke.points[0].x * scale, boardTop + stroke.points[0].y * scale);
    for (const point of stroke.points.slice(1)) {
      context.lineTo(MARGIN + point.x * scale, boardTop + point.y * scale);
    }
    context.stroke();
  }
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png');
  });
}
