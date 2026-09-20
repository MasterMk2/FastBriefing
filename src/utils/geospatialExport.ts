import type { DisplaySettings, MissionData } from '../types/mission';
import { dcsToLatLon } from './coordinates';
import { applyViewMode } from './viewMode';

type LonLat = [number, number];
type Geometry =
  | { type: 'LineString'; coordinates: LonLat[] }
  | { type: 'Polygon'; coordinates: LonLat[][] }
  | { type: 'Point'; coordinates: LonLat };

export interface GeoFeature {
  type: 'Feature';
  geometry: Geometry;
  properties: {
    kind: 'route' | 'zone';
    name: string;
    side?: 'blue' | 'red';
    callsign?: string;
    groupId?: number;
    zoneId?: number;
  };
}

export interface GeospatialExport {
  type: 'FeatureCollection';
  features: GeoFeature[];
  skipped: number;
}

const CIRCLE_SEGMENTS = 64;
const EARTH_RADIUS_METERS = 6371008.8;

/** Export only positions resolved to WGS84. Never turn DCS coordinates into 0,0. */
export function buildGeospatialExport(
  mission: MissionData,
  viewMode: DisplaySettings['viewMode'],
): GeospatialExport {
  const visible = applyViewMode(mission, viewMode);
  const features: GeoFeature[] = [];
  let skipped = 0;

  for (const side of ['blue', 'red'] as const) {
    for (const flight of visible.coalitions[side].flights) {
      const coordinates = flight.route.map(point =>
        point.latlonResolved === false ? null : toLonLat(point.latlon));
      if (coordinates.some(coordinate => coordinate === null) || coordinates.length < 2) {
        skipped += 1;
        continue;
      }
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coordinates as LonLat[] },
        properties: { kind: 'route', name: flight.name, callsign: flight.callsign, groupId: flight.groupId, side },
      });
    }
  }

  for (const zone of visible.coalitions.blue.zones) {
    let geometry: Geometry | null = null;
    if (zone.type === 0) {
      const center = dcsToLatLon(visible.meta.theatre, zone.xy[0], zone.xy[1]);
      if (center && isValidLatLon(center) && Number.isFinite(zone.radius) && zone.radius >= 0) {
        const centerLonLat = toLonLat(center)!;
        geometry = zone.radius > 0
          ? { type: 'Polygon', coordinates: [circleRing(centerLonLat, zone.radius)] }
          : { type: 'Point', coordinates: centerLonLat };
      }
    } else {
      const vertices = (zone.vertices ?? []).map(([x, y]) => dcsToLatLon(visible.meta.theatre, x, y));
      if (vertices.length >= 2 && vertices.every((point): point is [number, number] => point !== null && isValidLatLon(point))) {
        const ring = vertices.map(point => toLonLat(point)!);
        geometry = ring.length >= 3
          ? { type: 'Polygon', coordinates: [closeRing(ring)] }
          : { type: 'LineString', coordinates: ring };
      }
    }
    if (!geometry) {
      skipped += 1;
      continue;
    }
    features.push({
      type: 'Feature',
      geometry,
      properties: { kind: 'zone', name: zone.name, zoneId: zone.zoneId },
    });
  }

  return { type: 'FeatureCollection', features, skipped };
}

export function toGeoJson(result: GeospatialExport): string {
  return JSON.stringify({ type: result.type, features: result.features }, null, 2);
}

export function toKml(result: GeospatialExport): string {
  const placemarks = result.features.map(feature => {
    const description = feature.properties.kind === 'route'
      ? `${feature.properties.side ?? ''} ${feature.properties.callsign ?? ''}`.trim()
      : 'Trigger zone';
    return `<Placemark><name>${escapeXml(feature.properties.name)}</name><description>${escapeXml(description)}</description>${geometryToKml(feature.geometry)}</Placemark>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${placemarks}</Document></kml>`;
}

function geometryToKml(geometry: Geometry): string {
  if (geometry.type === 'Point') {
    return `<Point><coordinates>${formatCoordinate(geometry.coordinates)}</coordinates></Point>`;
  }
  if (geometry.type === 'LineString') {
    return `<LineString><coordinates>${geometry.coordinates.map(formatCoordinate).join(' ')}</coordinates></LineString>`;
  }
  return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${geometry.coordinates[0].map(formatCoordinate).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
}

function formatCoordinate([lon, lat]: LonLat): string {
  return `${lon},${lat}`;
}

function toLonLat([lat, lon]: [number, number]): LonLat | null {
  return isValidLatLon([lat, lon]) ? [lon, lat] : null;
}

function isValidLatLon([lat, lon]: [number, number]): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon)
    && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

function closeRing(coordinates: LonLat[]): LonLat[] {
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  return first[0] === last[0] && first[1] === last[1]
    ? coordinates
    : [...coordinates, first];
}

function circleRing(center: LonLat, radiusMeters: number): LonLat[] {
  const [lon, lat] = center;
  const latitude = lat * Math.PI / 180;
  const longitude = lon * Math.PI / 180;
  const angularDistance = radiusMeters / EARTH_RADIUS_METERS;
  const ring: LonLat[] = [];
  for (let index = 0; index < CIRCLE_SEGMENTS; index += 1) {
    const bearing = index * 2 * Math.PI / CIRCLE_SEGMENTS;
    const destinationLat = Math.asin(Math.sin(latitude) * Math.cos(angularDistance)
      + Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing));
    const destinationLon = longitude + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
      Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(destinationLat),
    );
    ring.push([destinationLon * 180 / Math.PI, destinationLat * 180 / Math.PI]);
  }
  return closeRing(ring);
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]!);
}
