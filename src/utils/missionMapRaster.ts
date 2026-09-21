import type { AIGroup, DrawingObject, Flight, MissionData, SupportAsset, TriggerZone } from '../types/mission';

export interface MissionMapRoute {
  key: string;
  label: string;
  side: 'blue' | 'red' | 'neutral';
  points: [number, number][];
}

export interface MissionMapScene {
  routes: MissionMapRoute[];
  zones: TriggerZone[];
  drawings: DrawingObject[];
  support: SupportAsset[];
  threats: AIGroup[];
}

export interface MissionMapLabels {
  empty: string;
  routes: string;
  support: string;
  threats: string;
  zones: string;
}

const ROUTE_COLORS = { blue: '#175cd3', red: '#b42318', neutral: '#667085' } as const;

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

  return {
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
  };
}

export function drawMissionMap(
  context: CanvasRenderingContext2D,
  scene: MissionMapScene,
  left: number,
  top: number,
  width: number,
  height: number,
  labels: MissionMapLabels,
): boolean {
  context.save();
  context.fillStyle = '#f5f8fb';
  context.fillRect(left, top, width, height);
  context.strokeStyle = '#d0d5dd';
  context.lineWidth = 2;
  context.strokeRect(left, top, width, height);

  const extent = calculateExtent(scene);
  if (!extent) {
    context.fillStyle = '#475467';
    context.font = '28px sans-serif';
    context.fillText(labels.empty, left + 32, top + 64);
    context.restore();
    return false;
  }

  const padding = Math.max(32, Math.min(width, height) * 0.06);
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const spanNorth = Math.max(1000, extent.maxNorth - extent.minNorth);
  const spanEast = Math.max(1000, extent.maxEast - extent.minEast);
  const scale = Math.min(availableWidth / spanEast, availableHeight / spanNorth);
  const centerNorth = (extent.minNorth + extent.maxNorth) / 2;
  const centerEast = (extent.minEast + extent.maxEast) / 2;
  const project = ([north, east]: [number, number]): [number, number] => [
    left + width / 2 + (east - centerEast) * scale,
    top + height / 2 - (north - centerNorth) * scale,
  ];

  context.save();
  context.beginPath();
  context.rect(left, top, width, height);
  context.clip();
  drawGrid(context, left, top, width, height);

  for (const object of scene.drawings) drawObject(context, object, project);
  for (const zone of scene.zones) drawZone(context, zone, project, scale);
  for (const threat of scene.threats) drawThreat(context, threat, project, scale);
  for (const route of scene.routes) drawRoute(context, route, project);
  for (const asset of scene.support) drawSupport(context, asset, project);
  context.restore();

  drawNorthArrow(context, left + width - 54, top + 34);
  drawLegend(context, scene, left + 20, top + height - 28, labels);
  context.restore();
  return true;
}

function calculateExtent(scene: MissionMapScene) {
  const points: [number, number][] = [
    ...scene.routes.flatMap(route => route.points),
    ...scene.drawings.flatMap(object => object.points).filter(isFinitePoint),
    ...scene.support.map(asset => asset.position).filter(isFinitePoint),
    ...scene.threats.map(group => group.position).filter(isFinitePoint),
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

function drawGrid(context: CanvasRenderingContext2D, left: number, top: number, width: number, height: number) {
  context.strokeStyle = '#e4e7ec';
  context.lineWidth = 1;
  for (let index = 1; index < 5; index += 1) {
    const x = left + width * index / 5;
    const y = top + height * index / 5;
    context.beginPath(); context.moveTo(x, top); context.lineTo(x, top + height); context.stroke();
    context.beginPath(); context.moveTo(left, y); context.lineTo(left + width, y); context.stroke();
  }
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
  context.strokeStyle = '#b54708';
  context.fillStyle = 'rgba(245, 158, 11, 0.08)';
  context.lineWidth = 3;
  context.setLineDash([12, 8]);
  context.beginPath();
  if (zone.type === 2 && zone.vertices?.length) {
    const points = zone.vertices.filter(isFinitePoint).map(project);
    if (points.length === 0) return;
    context.moveTo(points[0][0], points[0][1]);
    for (const point of points.slice(1)) context.lineTo(point[0], point[1]);
    context.closePath();
  } else {
    const center = project(zone.xy);
    context.arc(center[0], center[1], Math.max(2, zone.radius * scale), 0, Math.PI * 2);
  }
  context.fill();
  context.stroke();
  context.setLineDash([]);
}

function drawThreat(context: CanvasRenderingContext2D, threat: AIGroup, project: (point: [number, number]) => [number, number], scale: number) {
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
}

function drawRoute(context: CanvasRenderingContext2D, route: MissionMapRoute, project: (point: [number, number]) => [number, number]) {
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
    if (index === 0) context.fillText(route.label, point[0] + 12, point[1] - 10);
  });
}

function drawSupport(context: CanvasRenderingContext2D, asset: SupportAsset, project: (point: [number, number]) => [number, number]) {
  const [x, y] = project(asset.position);
  context.fillStyle = '#067647';
  context.beginPath();
  context.moveTo(x, y - 8); context.lineTo(x + 8, y); context.lineTo(x, y + 8); context.lineTo(x - 8, y); context.closePath();
  context.fill();
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
