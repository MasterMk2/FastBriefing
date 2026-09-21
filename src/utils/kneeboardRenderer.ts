import type { KneeboardPage, KneeboardTranslate } from './kneeboard';
import { WHITEBOARD_HEIGHT, WHITEBOARD_WIDTH } from '../hooks/useWhiteboard';
import { drawMissionMap } from './missionMapRaster';

const BASE_WIDTH = 1536;
const BASE_HEIGHT = 2048;
const MARGIN = 96;
const CONTENT_BOTTOM = 1870;
const TEXT_LINE_HEIGHT = 48;

interface CanvasPage {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
}

export async function renderKneeboardPages(
  pages: KneeboardPage[],
  width: number,
  t: KneeboardTranslate,
): Promise<Uint8Array[]> {
  if (!Number.isInteger(width) || width % 3 !== 0 || width < 768 || width > 3072) {
    throw new Error('Invalid kneeboard width');
  }
  const canvases: CanvasPage[] = [];
  for (const page of pages) {
    if (page.kind === 'text') renderTextPage(page, width, t, canvases);
    else if (page.kind === 'map') renderMapPage(page, width, t, canvases);
    else renderWhiteboardPage(page, width, t, canvases);
  }

  return Promise.all(canvases.map(async ({ canvas, context }, index) => {
    context.fillStyle = '#526176';
    context.font = '26px sans-serif';
    context.textAlign = 'right';
    context.fillText(`${index + 1} / ${canvases.length}`, BASE_WIDTH - MARGIN, BASE_HEIGHT - 64);
    const blob = await canvasToPng(canvas);
    return new Uint8Array(await blob.arrayBuffer());
  }));
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

function renderTextPage(
  page: Extract<KneeboardPage, { kind: 'text' }>,
  width: number,
  t: KneeboardTranslate,
  canvases: CanvasPage[],
): void {
  let current = createPage(page.title, width);
  canvases.push(current);
  let y = 240;
  const nextPage = () => {
    current = createPage(`${page.title} (${t('kneeboard.continued')})`, width);
    canvases.push(current);
    y = 240;
  };

  for (const section of page.sections) {
    if (y + 110 > CONTENT_BOTTOM) nextPage();
    current.context.font = 'bold 38px sans-serif';
    current.context.fillStyle = '#17324f';
    current.context.fillText(section.heading, MARGIN, y, BASE_WIDTH - MARGIN * 2);
    y += 64;
    current.context.font = '32px sans-serif';
    current.context.fillStyle = '#1e2936';
    for (const sourceLine of section.lines) {
      const wrapped = wrapLine(current.context, sourceLine, BASE_WIDTH - MARGIN * 2);
      for (const line of wrapped) {
        if (y + TEXT_LINE_HEIGHT > CONTENT_BOTTOM) nextPage();
        current.context.font = '32px sans-serif';
        current.context.fillStyle = '#1e2936';
        current.context.fillText(line, MARGIN, y);
        y += TEXT_LINE_HEIGHT;
      }
    }
    y += 22;
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

function renderMapPage(
  page: Extract<KneeboardPage, { kind: 'map' }>,
  width: number,
  t: KneeboardTranslate,
  canvases: CanvasPage[],
): void {
  const current = createPage(page.title, width);
  canvases.push(current);
  const { context } = current;
  const mapLeft = MARGIN + 40;
  const mapTop = 220;
  const mapWidth = BASE_WIDTH - (MARGIN + 40) * 2;
  const mapHeight = 1580;
  drawMissionMap(context, page.scene, mapLeft, mapTop, mapWidth, mapHeight, {
    empty: t('kneeboard.noMap'),
    routes: t('mapRaster.routes'),
    support: t('mapRaster.support'),
    threats: t('mapRaster.threats'),
    zones: t('mapRaster.zones'),
  });
}

function renderWhiteboardPage(
  page: Extract<KneeboardPage, { kind: 'whiteboard' }>,
  width: number,
  t: KneeboardTranslate,
  canvases: CanvasPage[],
): void {
  if (page.data.strokes.length === 0) {
    renderTextPage({
      kind: 'text',
      section: 'whiteboard',
      title: page.title,
      sections: [{
        heading: t('whiteboard.notes'),
        lines: page.data.notes ? page.data.notes.split(/\r?\n/) : [t('export.markdown.noWhiteboardNotes')],
      }],
    }, width, t, canvases);
    return;
  }

  const current = createPage(page.title, width);
  canvases.push(current);
  const { context } = current;
  context.font = '32px sans-serif';
  const wrappedNotes = page.data.notes
    .split(/\r?\n/)
    .flatMap(line => wrapLine(context, line, BASE_WIDTH - MARGIN * 2));
  const firstPageLines = wrappedNotes.slice(0, 7);
  let y = 230;
  context.fillStyle = '#1e2936';
  for (const line of firstPageLines) {
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

  const overflow = wrappedNotes.slice(firstPageLines.length);
  if (overflow.length > 0) {
    renderTextPage({
      kind: 'text',
      section: 'whiteboard',
      title: `${page.title} (${t('kneeboard.continued')})`,
      sections: [{ heading: t('whiteboard.notes'), lines: overflow }],
    }, width, t, canvases);
  }
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png');
  });
}
