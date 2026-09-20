import type { KneeboardPage, KneeboardTranslate } from './kneeboard';

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
    else renderMapPage(page, width, t, canvases);
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
  const flightPoints = page.flights.flatMap(flight => flight.route.map(point => point.xy));
  const zonePoints = page.zones.flatMap(zone => zone.type === 0
    ? [[zone.xy[0] - zone.radius, zone.xy[1] - zone.radius], [zone.xy[0] + zone.radius, zone.xy[1] + zone.radius]]
    : zone.vertices ?? []);
  const allPoints = [...flightPoints, ...zonePoints].filter(([north, east]) => Number.isFinite(north) && Number.isFinite(east));
  if (allPoints.length === 0) {
    context.font = '34px sans-serif';
    context.fillStyle = '#1e2936';
    context.fillText(t('kneeboard.noMap'), MARGIN, 300);
    return;
  }

  const northValues = allPoints.map(point => point[0]);
  const eastValues = allPoints.map(point => point[1]);
  const minNorth = Math.min(...northValues);
  const maxNorth = Math.max(...northValues);
  const minEast = Math.min(...eastValues);
  const maxEast = Math.max(...eastValues);
  const spanNorth = Math.max(1000, maxNorth - minNorth);
  const spanEast = Math.max(1000, maxEast - minEast);
  const mapLeft = MARGIN + 40;
  const mapTop = 300;
  const mapWidth = BASE_WIDTH - (MARGIN + 40) * 2;
  const mapHeight = 1350;
  const scale = Math.min(mapWidth / spanEast, mapHeight / spanNorth) * 0.88;
  const centerNorth = (minNorth + maxNorth) / 2;
  const centerEast = (minEast + maxEast) / 2;
  const project = ([north, east]: [number, number]): [number, number] => [
    mapLeft + mapWidth / 2 + (east - centerEast) * scale,
    mapTop + mapHeight / 2 - (north - centerNorth) * scale,
  ];

  context.fillStyle = '#f5f8fb';
  context.fillRect(mapLeft, mapTop, mapWidth, mapHeight);
  context.strokeStyle = '#d7e1ea';
  context.lineWidth = 2;
  for (let index = 1; index < 4; index += 1) {
    const x = mapLeft + mapWidth * index / 4;
    const y = mapTop + mapHeight * index / 4;
    context.beginPath(); context.moveTo(x, mapTop); context.lineTo(x, mapTop + mapHeight); context.stroke();
    context.beginPath(); context.moveTo(mapLeft, y); context.lineTo(mapLeft + mapWidth, y); context.stroke();
  }

  context.save();
  context.beginPath();
  context.rect(mapLeft, mapTop, mapWidth, mapHeight);
  context.clip();
  context.strokeStyle = '#b96b22';
  context.lineWidth = 3;
  context.setLineDash([12, 8]);
  for (const zone of page.zones) {
    if (zone.type === 0 && zone.radius > 0) {
      const [x, y] = project(zone.xy);
      context.beginPath(); context.arc(x, y, zone.radius * scale, 0, 2 * Math.PI); context.stroke();
    } else if ((zone.vertices?.length ?? 0) >= 2) {
      context.beginPath();
      zone.vertices!.forEach((vertex, index) => {
        const [x, y] = project(vertex);
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
      });
      context.closePath(); context.stroke();
    }
  }
  context.setLineDash([]);
  const colors = ['#1368a8', '#b02735', '#2e7950', '#7745a5', '#a76814'];
  page.flights.forEach((flight, flightIndex) => {
    const color = colors[flightIndex % colors.length];
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 6;
    context.beginPath();
    flight.route.forEach((point, index) => {
      const [x, y] = project(point.xy);
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.stroke();
    context.font = 'bold 23px sans-serif';
    flight.route.forEach(point => {
      const [x, y] = project(point.xy);
      context.beginPath(); context.arc(x, y, 10, 0, 2 * Math.PI); context.fill();
      context.fillText(String(point.index), x + 14, y - 12);
    });
  });
  context.restore();

  context.fillStyle = '#1e2936';
  context.font = '27px sans-serif';
  context.fillText(t('kneeboard.mapNote'), mapLeft, 1710);
  page.flights.forEach((flight, index) => {
    context.fillStyle = colors[index % colors.length];
    context.fillText(`${flight.callsign} · ${flight.type}`, mapLeft, 1760 + index * 32, mapWidth);
  });
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png');
  });
}
