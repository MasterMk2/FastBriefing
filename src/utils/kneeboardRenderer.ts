import type { KneeboardPage, KneeboardTranslate } from './kneeboard';
import { WHITEBOARD_HEIGHT, WHITEBOARD_WIDTH } from '../hooks/useWhiteboard';
import { drawMissionMap, type MissionMapLabels } from './missionMapRaster';

const BASE_WIDTH = 1536;
const BASE_HEIGHT = 2048;
const MARGIN = 96;
const CONTENT_BOTTOM = 1870;
const TEXT_LINE_HEIGHT = 48;
export const MAX_KNEEBOARD_PAGES = 64;
export const MAX_KNEEBOARD_PIXELS = 128_000_000;

export interface KneeboardRenderOptions {
  /** Called after each page is encoded, with the finished count and the total. */
  onProgress?: (done: number, total: number) => void;
  /** Checked between batches. An aborted render rejects with an error whose name is 'AbortError'. */
  signal?: AbortSignal;
}

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

export type KneeboardBudget =
  | { kind: 'ok' }
  | { kind: 'pages'; limit: number }
  | { kind: 'pixels'; limit: number };

/**
 * Whether `pageCount` pages at `width` fit the limits. The page limit does not depend on the
 * width, so it is reported separately: a smaller width cannot fix it.
 */
export function kneeboardBudget(pageCount: number, width: number): KneeboardBudget {
  if (pageCount > MAX_KNEEBOARD_PAGES) return { kind: 'pages', limit: MAX_KNEEBOARD_PAGES };
  const height = Math.round(width * 4 / 3);
  const pixels = pageCount * width * height;
  if (!Number.isSafeInteger(pixels) || pixels > MAX_KNEEBOARD_PIXELS) {
    return { kind: 'pixels', limit: Math.floor(MAX_KNEEBOARD_PIXELS / (width * height)) };
  }
  return { kind: 'ok' };
}

/** The largest offered width at which `pageCount` pages fit, or null when none does. */
export function largestFittingWidth(pageCount: number, widths: readonly number[]): number | null {
  if (pageCount > MAX_KNEEBOARD_PAGES) return null;
  return [...widths].sort((a, b) => b - a).find(width => kneeboardBudget(pageCount, width).kind === 'ok') ?? null;
}

/**
 * A 2D context for measuring text. Uses a real canvas when the browser has one, and
 * otherwise a fixed-width stand-in, so the page count is always computed the same way.
 */
export function createMeasurementContext(): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d');
  if (context) return context;
  return {
    font: '',
    measureText: (text: string) => ({ width: Array.from(text).length * 17 }),
  } as unknown as CanvasRenderingContext2D;
}

/**
 * The exact number of physical pages `renderKneeboardPages` will produce for these pages.
 * The estimate on the export screen uses this same pagination, so it never disagrees with
 * the result.
 */
export function countKneeboardPages(
  pages: readonly KneeboardPage[],
  t: KneeboardTranslate,
  context: CanvasRenderingContext2D,
): number {
  context.font = '32px sans-serif';
  return paginatePages(pages, t, context).length;
}

export async function renderKneeboardPages(
  pages: KneeboardPage[],
  width: number,
  t: KneeboardTranslate,
  options: KneeboardRenderOptions = {},
): Promise<Uint8Array[]> {
  if (!Number.isInteger(width) || width % 3 !== 0 || width < 768 || width > 3072) {
    throw new Error(t('export:kneeboard.invalidWidth'));
  }

  const measurementContext = createMeasurementContext();
  const physicalPages = paginatePages(pages, t, measurementContext);
  assertKneeboardRenderBudget(physicalPages.length, width, t);

  const output: Uint8Array[] = [];
  const batchSize = width > 2048 ? 1 : 2;
  for (let batchStart = 0; batchStart < physicalPages.length; batchStart += batchSize) {
    if (options.signal?.aborted) throw abortError(t);
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
    options.onProgress?.(output.length, physicalPages.length);
  }
  return output;
}

export function assertKneeboardRenderBudget(
  pageCount: number,
  width: number,
  t: KneeboardTranslate,
): void {
  const budget = kneeboardBudget(pageCount, width);
  if (budget.kind === 'pages') {
    throw new Error(t('export:kneeboard.tooManyPages', { count: pageCount, limit: budget.limit }));
  }
  if (budget.kind === 'pixels') {
    throw new Error(t('export:kneeboard.tooManyPixels', { count: pageCount, limit: budget.limit }));
  }
}

function abortError(t: KneeboardTranslate): Error {
  const error = new Error(t('export:kneeboard.aborted'));
  error.name = 'AbortError';
  return error;
}

function paginatePages(
  pages: readonly KneeboardPage[],
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
        section: 'notes',
        title: page.title,
        sections: [{
          heading: t('export:label.whiteboardNotes'),
          lines: page.data.notes ? page.data.notes.split(/\r?\n/) : [t('export:label.noWhiteboardNotes')],
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
          section: 'notes',
          title: `${page.title} (${t('export:label.continued')})`,
          sections: [{ heading: t('export:label.whiteboardNotes'), lines: overflow }],
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
    title = `${page.title} (${t('export:label.continued')})`;
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

/**
 * Draws the map page. A missing basemap does not fail the page: the overlay is drawn and the
 * page says "地図背景なし" (SPEC 1.3), so the kneeboard is still usable offline.
 */
async function renderMapPage(
  page: Extract<KneeboardPage, { kind: 'map' }>,
  context: CanvasRenderingContext2D,
  t: KneeboardTranslate,
): Promise<void> {
  const mapLeft = MARGIN + 40;
  const mapTop = 220;
  const mapWidth = BASE_WIDTH - (MARGIN + 40) * 2;
  const mapHeight = 1580;
  await drawMissionMap(context, page.scene, mapLeft, mapTop, mapWidth, mapHeight, mapLabels(t));
}

export function mapLabels(t: KneeboardTranslate): MissionMapLabels {
  return {
    empty: t('export:label.mapEmpty'),
    basemapUnavailable: t('export:label.basemapUnavailable'),
    basemapDisabled: t('export:label.basemapDisabled'),
    routes: t('export:label.mapRoutes'),
    support: t('export:label.mapSupport'),
    threats: t('export:label.mapThreats'),
    zones: t('export:label.mapZones'),
    skippedAnnotations: t('export:label.mapAnnotationsSkipped'),
  };
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

