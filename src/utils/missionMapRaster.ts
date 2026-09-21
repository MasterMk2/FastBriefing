import type { AIGroup, DrawingObject, Flight, MissionData, SupportAsset, TriggerZone } from '../types/mission';
import { dcsToLatLon, latLonToDCS } from './coordinates';

export interface MissionMapRoute {
  key: string;
  label: string;
  side: 'blue' | 'red' | 'neutral';
  points: [number, number][];
}

export interface MissionMapScene {
  theatre: string;
  routes: MissionMapRoute[];
  zones: TriggerZone[];
  drawings: DrawingObject[];
  support: SupportAsset[];
  threats: AIGroup[];
  userPins: Array<{ id: string; position: [number, number]; label: string; color: string }>;
  userStrokes: Array<{ id: string; points: [number, number][]; color: string; width: number }>;
  unprojectableMapAnnotations: number;
}

export interface MissionMapLabels {
  empty: string;
  basemapUnavailable: string;
  routes: string;
  support: string;
  threats: string;
  zones: string;
}

const ROUTE_COLORS = { blue: '#175cd3', red: '#b42318', neutral: '#667085' } as const;
const TILE_SIZE = 256;
const MIN_TILE_ZOOM = 2;
const MAX_TILE_ZOOM = 14;
const TILE_LOAD_TIMEOUT_MS = 8000;
const tileCache = new Map<string, Promise<HTMLImageElement | null>>();

export function buildMissionMapScene(mission: MissionData, flights?: readonly Flight[]): MissionMapScene {
  const selectedFlights = flights
    ? new Set(flights)
    : null;
  const routes: MissionMapRoute[] = [];
  for (const side of ['blue', 'red', 'neutral'] as const) {
    for (const flight of mission.coalitions[side].flights) {
      if (selectedFlights && !selectedFlights.has(flight)) continue;
      const points = flight.route.map(point => point.xy).filter(isFinitePoint);
      if (points.length === 0) continue;
      routes.push({ key: `${side}:${flight.groupId}`, label: flight.callsign || flight.name, side, points });
    }
  }

  const userPins: MissionMapScene['userPins'] = [];
  const userStrokes: MissionMapScene['userStrokes'] = [];
  let unprojectableMapAnnotations = 0;
  for (const annotation of mission.userNotes?.mapAnnotations ?? []) {
    if (annotation.kind === 'pin') {
      const position = latLonToDCS(mission.meta.theatre, annotation.position[0], annotation.position[1]);
      if (position) userPins.push({ id: annotation.id, position, label: annotation.label, color: annotation.color });
      else unprojectableMapAnnotations += 1;
    } else {
      const projected = annotation.points
        .map(point => latLonToDCS(mission.meta.theatre, point[0], point[1]));
      if (projected.some(point => point === null) || projected.length < 2) {
        unprojectableMapAnnotations += 1;
      } else {
        userStrokes.push({
          id: annotation.id,
          points: projected as [number, number][],
          color: annotation.color,
          width: annotation.width,
        });
      }
    }
  }

  return {
    theatre: mission.meta.theatre,
    routes,
    // Normalization intentionally shares mission-level drawings and zones between coalitions.
    // Read the canonical blue collection once so exports do not triple-count them.
    zones: mission.coalitions.blue.zones,
    drawings: mission.coalitions.blue.drawings
      .filter(drawing => drawing.visible)
      .flatMap(drawing => drawing.objects),
    support: dedupeSupport([
      ...mission.coalitions.blue.support,
      ...mission.coalitions.red.support,
      ...mission.coalitions.neutral.support,
    ]),
    threats: mission.coalitions.red.aiGroups.filter(group => isFinitePoint(group.position)),
    userPins,
    userStrokes,
    unprojectableMapAnnotations,
  };
}

export function hasMissionMapContent(scene: MissionMapScene): boolean {
  return scene.routes.length + scene.zones.length + scene.drawings.length
    + scene.support.length + scene.threats.length
    + scene.userPins.length + scene.userStrokes.length
    + scene.unprojectableMapAnnotations > 0;
}

export async function drawMissionMap(
  context: CanvasRenderingContext2D,
  scene: MissionMapScene,
  left: number,
  top: number,
  width: number,
  height: number,
  labels: MissionMapLabels,
): Promise<boolean> {
  context.save();
  context.fillStyle = '#f5f8fb';
  context.fillRect(left, top, width, height);
  context.strokeStyle = '#d0d5dd';
  context.lineWidth = 2;
  context.strokeRect(left, top, width, height);

  if (scene.unprojectableMapAnnotations > 0) {
    drawMapMessage(context, labels.basemapUnavailable, left, top);
    context.restore();
    return false;
  }

  const extent = calculateExtent(scene);
  if (!extent) {
    context.fillStyle = '#475467';
    context.font = '28px sans-serif';
    context.fillText(labels.empty, left + 32, top + 64);
    context.restore();
    return false;
  }

  const projection = createMapProjection(scene.theatre, extent, left, top, width, height);
  if (!projection) {
    drawMapMessage(context, labels.basemapUnavailable, left, top);
    context.restore();
    return false;
  }
  const project = projection.projectDcs;
  const scale = projection.dcsScale;

  context.save();
  context.beginPath();
  context.rect(left, top, width, height);
  context.clip();
  const tileCount = await drawBasemapTiles(context, projection, left, top, width, height);
  if (tileCount === 0) {
    context.restore();
    drawMapMessage(context, labels.basemapUnavailable, left, top);
    context.restore();
    return false;
  }

  for (const object of scene.drawings) drawObject(context, object, project);
  for (const zone of scene.zones) drawZone(context, zone, project, scale);
  for (const threat of scene.threats) drawThreat(context, threat, project, scale);
  for (const route of scene.routes) drawRoute(context, route, project, left, top, width);
  for (const asset of scene.support) drawSupport(context, asset, project);
  for (const stroke of scene.userStrokes) drawUserStroke(context, stroke, project);
  for (const pin of scene.userPins) drawUserPin(context, pin, project);
  if (tileCount > 0) drawAttribution(context, left, top, width, height);
  context.restore();

  drawNorthArrow(context, left + width - 54, top + 34);
  drawLegend(context, scene, left + 20, top + height - 28, labels);
  context.restore();
  return true;
}

interface MapProjection {
  zoom: number;
  centerX: number;
  centerY: number;
  worldSize: number;
  dcsScale: number;
  projectDcs: (point: [number, number]) => [number, number];
}

function createMapProjection(
  theatre: string,
  extent: NonNullable<ReturnType<typeof calculateExtent>>,
  left: number,
  top: number,
  width: number,
  height: number,
): MapProjection | null {
  const corners = [
    [extent.minNorth, extent.minEast],
    [extent.minNorth, extent.maxEast],
    [extent.maxNorth, extent.minEast],
    [extent.maxNorth, extent.maxEast],
  ] as [number, number][];
  const geographic = corners.map(([north, east]) => dcsToLatLon(theatre, north, east));
  if (geographic.some(point => point === null)) return null;
  const normalized = geographic.map(point => webMercator(point![0], point![1]));
  const minX = Math.min(...normalized.map(point => point[0]));
  const maxX = Math.max(...normalized.map(point => point[0]));
  const minY = Math.min(...normalized.map(point => point[1]));
  const maxY = Math.max(...normalized.map(point => point[1]));
  const padding = Math.max(32, Math.min(width, height) * 0.06);
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const spanX = Math.max(1 / 2 ** MAX_TILE_ZOOM, maxX - minX);
  const spanY = Math.max(1 / 2 ** MAX_TILE_ZOOM, maxY - minY);
  const fittingZoom = Math.floor(Math.log2(Math.min(
    availableWidth / (spanX * TILE_SIZE),
    availableHeight / (spanY * TILE_SIZE),
  )));
  const zoom = Math.max(MIN_TILE_ZOOM, Math.min(MAX_TILE_ZOOM, fittingZoom));
  const worldSize = TILE_SIZE * 2 ** zoom;
  const centerX = (minX + maxX) / 2 * worldSize;
  const centerY = (minY + maxY) / 2 * worldSize;
  const projectDcs = ([north, east]: [number, number]): [number, number] => {
    const latlon = dcsToLatLon(theatre, north, east);
    if (!latlon) return [left + width / 2, top + height / 2];
    const [x, y] = webMercator(latlon[0], latlon[1]);
    return [left + width / 2 + x * worldSize - centerX, top + height / 2 + y * worldSize - centerY];
  };
  const west = projectDcs([extent.minNorth, extent.minEast]);
  const east = projectDcs([extent.minNorth, extent.maxEast]);
  const south = projectDcs([extent.minNorth, extent.minEast]);
  const north = projectDcs([extent.maxNorth, extent.minEast]);
  const eastScale = Math.abs(east[0] - west[0]) / Math.max(1, extent.maxEast - extent.minEast);
  const northScale = Math.abs(north[1] - south[1]) / Math.max(1, extent.maxNorth - extent.minNorth);
  return { zoom, centerX, centerY, worldSize, dcsScale: Math.min(eastScale, northScale), projectDcs };
}

function webMercator(lat: number, lon: number): [number, number] {
  const boundedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sin = Math.sin(boundedLat * Math.PI / 180);
  return [
    (lon + 180) / 360,
    0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI),
  ];
}

async function drawBasemapTiles(
  context: CanvasRenderingContext2D,
  projection: MapProjection,
  left: number,
  top: number,
  width: number,
  height: number,
): Promise<number> {
  if (typeof Image === 'undefined') return 0;
  const minWorldX = projection.centerX - width / 2;
  const maxWorldX = projection.centerX + width / 2;
  const minWorldY = projection.centerY - height / 2;
  const maxWorldY = projection.centerY + height / 2;
  const minTileX = Math.floor(minWorldX / TILE_SIZE);
  const maxTileX = Math.floor(maxWorldX / TILE_SIZE);
  const minTileY = Math.floor(minWorldY / TILE_SIZE);
  const maxTileY = Math.floor(maxWorldY / TILE_SIZE);
  const tileLimit = 2 ** projection.zoom;
  const requests: Promise<{ image: HTMLImageElement | null; x: number; y: number }>[] = [];
  for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
    if (tileY < 0 || tileY >= tileLimit) continue;
    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
      const wrappedX = ((tileX % tileLimit) + tileLimit) % tileLimit;
      const url = `https://tile.openstreetmap.org/${projection.zoom}/${wrappedX}/${tileY}.png`;
      requests.push(loadTile(url).then(image => ({ image, x: tileX, y: tileY })));
    }
  }
  const tiles = await Promise.all(requests);
  let drawn = 0;
  for (const tile of tiles) {
    if (!tile.image) continue;
    const x = left + width / 2 + tile.x * TILE_SIZE - projection.centerX;
    const y = top + height / 2 + tile.y * TILE_SIZE - projection.centerY;
    context.drawImage(tile.image, x, y, TILE_SIZE, TILE_SIZE);
    drawn += 1;
  }
  return drawn;
}

function loadTile(url: string): Promise<HTMLImageElement | null> {
  const cached = tileCache.get(url);
  if (cached) return cached;
  const request = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    const timeout = globalThis.setTimeout(() => resolve(null), TILE_LOAD_TIMEOUT_MS);
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      globalThis.clearTimeout(timeout);
      resolve(image);
    };
    image.onerror = () => {
      globalThis.clearTimeout(timeout);
      resolve(null);
    };
    image.src = url;
  });
  tileCache.set(url, request);
  void request.then(image => {
    if (!image && tileCache.get(url) === request) tileCache.delete(url);
  });
  if (tileCache.size > 256) tileCache.delete(tileCache.keys().next().value!);
  return request;
}

function drawAttribution(context: CanvasRenderingContext2D, left: number, top: number, width: number, height: number) {
  const text = '© OpenStreetMap contributors';
  context.save();
  context.font = '16px sans-serif';
  context.textAlign = 'right';
  const textWidth = context.measureText(text).width;
  context.fillStyle = 'rgba(255, 255, 255, 0.84)';
  context.fillRect(left + width - textWidth - 14, top + height - 24, textWidth + 12, 22);
  context.fillStyle = '#344054';
  context.fillText(text, left + width - 8, top + height - 7);
  context.restore();
}

function calculateExtent(scene: MissionMapScene) {
  const points: [number, number][] = [
    ...scene.routes.flatMap(route => route.points),
    ...scene.drawings.flatMap(object => object.points).filter(isFinitePoint),
    ...scene.support.map(asset => asset.position).filter(isFinitePoint),
    ...scene.threats.map(group => group.position).filter(isFinitePoint),
    ...scene.userPins.map(pin => pin.position).filter(isFinitePoint),
    ...scene.userStrokes.flatMap(stroke => stroke.points).filter(isFinitePoint),
  ];
  for (const zone of scene.zones) {
    if (zone.type === 2 && zone.vertices) points.push(...zone.vertices.filter(isFinitePoint));
    else if (isFinitePoint(zone.xy)) {
      points.push([zone.xy[0] - zone.radius, zone.xy[1] - zone.radius]);
      points.push([zone.xy[0] + zone.radius, zone.xy[1] + zone.radius]);
    }
  }
  for (const threat of scene.threats) {
    const radius = Math.max(threat.threatRange ?? 0, threat.detectionRange ?? 0);
    if (radius > 0) {
      points.push([threat.position[0] - radius, threat.position[1] - radius]);
      points.push([threat.position[0] + radius, threat.position[1] + radius]);
    }
  }
  if (points.length === 0) return null;
  return {
    minNorth: Math.min(...points.map(point => point[0])),
    maxNorth: Math.max(...points.map(point => point[0])),
    minEast: Math.min(...points.map(point => point[1])),
    maxEast: Math.max(...points.map(point => point[1])),
  };
}

function drawMapMessage(context: CanvasRenderingContext2D, message: string, left: number, top: number) {
  context.fillStyle = '#475467';
  context.font = '28px sans-serif';
  context.fillText(message, left + 32, top + 64);
}

function drawObject(context: CanvasRenderingContext2D, object: DrawingObject, project: (point: [number, number]) => [number, number]) {
  const points = object.points.filter(isFinitePoint).map(project);
  if (points.length === 0) return;
  context.strokeStyle = normalizeCanvasColor(object.color, '#344054');
  context.fillStyle = normalizeCanvasColor(object.fillColor, 'rgba(52, 64, 84, 0.12)');
  context.lineWidth = Math.max(1, Math.min(8, object.thickness || 2));
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  for (const point of points.slice(1)) context.lineTo(point[0], point[1]);
  if (object.primitiveType === 'Polygon') {
    context.closePath();
    context.fill();
  }
  context.stroke();
}

function drawZone(context: CanvasRenderingContext2D, zone: TriggerZone, project: (point: [number, number]) => [number, number], scale: number) {
  context.save();
  context.strokeStyle = '#b54708';
  context.fillStyle = 'rgba(245, 158, 11, 0.08)';
  context.lineWidth = 3;
  context.setLineDash([12, 8]);
  context.beginPath();
  if (zone.type === 2 && zone.vertices?.length) {
    const points = zone.vertices.filter(isFinitePoint).map(project);
    if (points.length === 0) {
      context.restore();
      return;
    }
    context.moveTo(points[0][0], points[0][1]);
    for (const point of points.slice(1)) context.lineTo(point[0], point[1]);
    context.closePath();
  } else {
    const center = project(zone.xy);
    context.arc(center[0], center[1], Math.max(2, zone.radius * scale), 0, Math.PI * 2);
  }
  context.fill();
  context.stroke();
  context.restore();
}

function drawThreat(context: CanvasRenderingContext2D, threat: AIGroup, project: (point: [number, number]) => [number, number], scale: number) {
  context.save();
  const center = project(threat.position);
  if ((threat.detectionRange ?? 0) > 0) {
    context.strokeStyle = 'rgba(180, 35, 24, 0.55)';
    context.setLineDash([10, 7]);
    context.beginPath();
    context.arc(center[0], center[1], Math.max(2, threat.detectionRange! * scale), 0, Math.PI * 2);
    context.stroke();
  }
  if ((threat.threatRange ?? 0) > 0) {
    context.strokeStyle = '#b42318';
    context.fillStyle = 'rgba(180, 35, 24, 0.07)';
    context.setLineDash([]);
    context.beginPath();
    context.arc(center[0], center[1], Math.max(2, threat.threatRange! * scale), 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
  context.fillStyle = '#7a271a';
  context.fillRect(center[0] - 4, center[1] - 4, 8, 8);
  context.restore();
}

function drawRoute(
  context: CanvasRenderingContext2D,
  route: MissionMapRoute,
  project: (point: [number, number]) => [number, number],
  left: number,
  top: number,
  width: number,
) {
  const points = route.points.map(project);
  context.strokeStyle = ROUTE_COLORS[route.side];
  context.fillStyle = ROUTE_COLORS[route.side];
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  for (const point of points.slice(1)) context.lineTo(point[0], point[1]);
  context.stroke();
  context.font = '22px sans-serif';
  points.forEach((point, index) => {
    context.beginPath();
    context.arc(point[0], point[1], 7, 0, Math.PI * 2);
    context.fill();
    if (index === 0) {
      const labelWidth = context.measureText(route.label).width;
      const rightEdge = left + width - 20;
      const preferredX = point[0] + 12;
      const labelX = Math.max(left + 20, Math.min(
        preferredX + labelWidth <= rightEdge ? preferredX : point[0] - labelWidth - 12,
        rightEdge - labelWidth,
      ));
      context.fillText(route.label, labelX, Math.max(top + 30, point[1] - 10));
    }
  });
}

function drawSupport(context: CanvasRenderingContext2D, asset: SupportAsset, project: (point: [number, number]) => [number, number]) {
  const [x, y] = project(asset.position);
  context.fillStyle = '#067647';
  context.beginPath();
  context.moveTo(x, y - 8); context.lineTo(x + 8, y); context.lineTo(x, y + 8); context.lineTo(x - 8, y); context.closePath();
  context.fill();
}

function drawUserStroke(
  context: CanvasRenderingContext2D,
  stroke: MissionMapScene['userStrokes'][number],
  project: (point: [number, number]) => [number, number],
) {
  const points = stroke.points.map(project);
  if (points.length < 2) return;
  context.save();
  context.strokeStyle = normalizeCanvasColor(stroke.color, '#e53935');
  context.lineWidth = Math.max(1, Math.min(12, stroke.width));
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  for (const point of points.slice(1)) context.lineTo(point[0], point[1]);
  context.stroke();
  context.restore();
}

function drawUserPin(
  context: CanvasRenderingContext2D,
  pin: MissionMapScene['userPins'][number],
  project: (point: [number, number]) => [number, number],
) {
  const [x, y] = project(pin.position);
  context.save();
  context.fillStyle = normalizeCanvasColor(pin.color, '#e53935');
  context.beginPath();
  context.arc(x, y, 9, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#ffffff';
  context.lineWidth = 3;
  context.stroke();
  if (pin.label) {
    context.font = 'bold 20px sans-serif';
    const labelWidth = context.measureText(pin.label).width;
    context.fillStyle = 'rgba(255, 255, 255, 0.9)';
    context.fillRect(x + 12, y - 23, labelWidth + 12, 28);
    context.fillStyle = '#101828';
    context.fillText(pin.label, x + 18, y - 3);
  }
  context.restore();
}

function drawNorthArrow(context: CanvasRenderingContext2D, x: number, y: number) {
  context.fillStyle = '#101828';
  context.font = 'bold 22px sans-serif';
  context.textAlign = 'center';
  context.fillText('N', x, y);
  context.beginPath();
  context.moveTo(x, y + 8); context.lineTo(x - 8, y + 28); context.lineTo(x + 8, y + 28); context.closePath();
  context.fill();
  context.textAlign = 'start';
}

function drawLegend(context: CanvasRenderingContext2D, scene: MissionMapScene, x: number, y: number, labels: MissionMapLabels) {
  const parts: string[] = [];
  if (scene.routes.length) parts.push(`${labels.routes}: ${scene.routes.length}`);
  if (scene.support.length) parts.push(`${labels.support}: ${scene.support.length}`);
  if (scene.threats.length) parts.push(`${labels.threats}: ${scene.threats.length}`);
  if (scene.zones.length) parts.push(`${labels.zones}: ${scene.zones.length}`);
  context.fillStyle = '#344054';
  context.font = '20px sans-serif';
  context.fillText(parts.join('  ·  '), x, y);
}

function dedupeSupport(assets: SupportAsset[]): SupportAsset[] {
  const seen = new Set<string>();
  return assets.filter(asset => {
    const key = `${asset.kind}:${asset.callsign}:${asset.position.join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeCanvasColor(value: string | undefined, fallback: string): string {
  return value && (/^#[0-9a-f]{3,8}$/i.test(value) || /^rgba?\(/i.test(value)) ? value : fallback;
}

function isFinitePoint(value: [number, number]): boolean {
  return Number.isFinite(value[0]) && Number.isFinite(value[1]);
}
