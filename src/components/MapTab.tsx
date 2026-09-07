import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, LayerGroup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { DisplaySettings, Drawing, Flight, MissionData, SupportAsset, TriggerZone } from '../types/mission';
import { dcsToLatLon } from '../utils/coordinates';
import { applyViewMode } from '../utils/viewMode';

interface MapTabProps {
  mission: MissionData;
  settings: DisplaySettings;
}

type MapSide = 'blue' | 'red' | 'neutral';
type LatLon = [number, number];

const DEFAULT_CENTER: LatLon = [42.0, 43.0];
const DEFAULT_ZOOM = 7;
const BLUE_FLIGHT_COLOR_TOKEN = '--color-map-coalition-blue';
const RED_FLIGHT_COLOR_TOKEN = '--color-map-coalition-red';
const NEUTRAL_FLIGHT_COLOR_TOKEN = '--color-map-coalition-neutral';
const THREAT_ENGAGEMENT_COLOR_TOKEN = '--color-threat-engagement';
const THREAT_DETECTION_COLOR_TOKEN = '--color-threat-detection';
const DEFAULT_ZONE_COLOR_TOKEN = '--color-zone-default';
const DEFAULT_DRAWING_COLOR_TOKEN = '--color-drawing-default';

function getThemeColor(token: string): string {
  if (typeof document === 'undefined') return `var(${token})`;
  const value = document.defaultView?.getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value || `var(${token})`;
}

export default function MapTab({ mission, settings }: MapTabProps) {
  const { t } = useTranslation();
  const viewMission = useMemo(() => applyViewMode(mission, settings.viewMode), [mission, settings.viewMode]);
  const [layers, setLayers] = useState({
    flights: true,
    zones: true,
    drawings: true,
    threats: true,
    detection: false,
    support: true,
    enemies: true,
    bullseye: true,
    navpoints: true,
    airbases: true,
  });

  const missionZones = viewMission.coalitions.blue.zones;
  const missionDrawings = viewMission.coalitions.blue.drawings;
  const flightEntries = [
    ...viewMission.coalitions.blue.flights.map((flight, index) => ({ flight, side: 'blue' as const, index })),
    ...viewMission.coalitions.red.flights.map((flight, index) => ({ flight, side: 'red' as const, index })),
    ...viewMission.coalitions.neutral.flights.map((flight, index) => ({ flight, side: 'neutral' as const, index })),
  ];

  return (
    <div className="tab-panel map-tab">
      <div className="map-controls">
        <div className="layer-controls">
          {Object.entries(layers).map(([key, value]) => (
            <label key={key} htmlFor={`map-layer-${key}`} className="layer-toggle">
              <input
                id={`map-layer-${key}`}
                type="checkbox"
                aria-label={getLayerLabel(key, t)}
                checked={value}
                onChange={(e) => setLayers(prev => ({ ...prev, [key]: e.target.checked }))}
              />
              <span id={`map-layer-${key}-label`}>{getLayerLabel(key, t)}</span>
            </label>
          ))}
        </div>
        <div className="map-legend" aria-label={getLayerLabel('flights', t)}>
          <span className="map-legend-item">
            <span aria-hidden="true" style={{ display: 'inline-block', width: '2rem', borderTop: `2px solid ${getThemeColor(BLUE_FLIGHT_COLOR_TOKEN)}` }} />
            {t('common.blue')}
          </span>
          <span className="map-legend-item">
            <span aria-hidden="true" style={{ display: 'inline-block', width: '2rem', borderTop: `2px dashed ${getThemeColor(RED_FLIGHT_COLOR_TOKEN)}` }} />
            {t('common.red')}
          </span>
          <span className="map-legend-item">
            <span aria-hidden="true" style={{ display: 'inline-block', width: '2rem', borderTop: `2px dotted ${getThemeColor(NEUTRAL_FLIGHT_COLOR_TOKEN)}` }} />
            {t('common.neutral')}
          </span>
          <span className="map-legend-item">
            <span aria-hidden="true" className="map-legend-range-swatch map-legend-engagement-swatch" />
            {t('threats.engagementRange')}
          </span>
          <span className="map-legend-item">
            <span aria-hidden="true" className="map-legend-range-swatch map-legend-detection-swatch" />
            {t('threats.detectionRange')}
          </span>
        </div>
      </div>

      <div className="map-container" style={{ height: '600px' }}>
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapViewport mission={viewMission} includeDetectionRange={layers.detection} />

          {layers.bullseye && (
            <>
              {isResolvedLatLon(viewMission.coalitions.blue.bullseye.latlon, viewMission.coalitions.blue.bullseye.latlonResolved) && (
                <Marker
                  position={viewMission.coalitions.blue.bullseye.latlon}
                  alt={`${t('common.blue')} Bullseye`}
                  title={`${t('common.blue')} Bullseye`}
                >
                  <Popup>{t('map.blueBullseye')}</Popup>
                </Marker>
              )}
              {isResolvedLatLon(viewMission.coalitions.red.bullseye.latlon, viewMission.coalitions.red.bullseye.latlonResolved) && (
                <Marker
                  position={viewMission.coalitions.red.bullseye.latlon}
                  alt={`${t('common.red')} Bullseye`}
                  title={`${t('common.red')} Bullseye`}
                >
                  <Popup>{t('map.redBullseye')}</Popup>
                </Marker>
              )}
            </>
          )}

          {layers.navpoints && (
            <LayerGroup>
              {viewMission.coalitions.blue.navPoints.map(np => {
                if (!isResolvedLatLon(np.latlon, np.latlonResolved)) return null;
                const markerLabel = `${t('common.blue')} NavPoint ${np.index}: ${np.name}`;
                return (
                  <Marker
                    key={`blue-nav-${np.index}`}
                    position={np.latlon}
                    alt={markerLabel}
                    title={markerLabel}
                  >
                    <Popup>{t('map.blueNavPoint', { index: np.index, name: np.name })}</Popup>
                  </Marker>
                );
              })}
              {viewMission.coalitions.red.navPoints.map(np => {
                if (!isResolvedLatLon(np.latlon, np.latlonResolved)) return null;
                const markerLabel = `${t('common.red')} NavPoint ${np.index}: ${np.name}`;
                return (
                  <Marker
                    key={`red-nav-${np.index}`}
                    position={np.latlon}
                    alt={markerLabel}
                    title={markerLabel}
                  >
                    <Popup>{t('map.redNavPoint', { index: np.index, name: np.name })}</Popup>
                  </Marker>
                );
              })}
            </LayerGroup>
          )}

          {layers.airbases && (
            <LayerGroup>
              {viewMission.coalitions.blue.airbases.map(ab => {
                if (!isResolvedLatLon(ab.latlon, ab.latlonResolved)) return null;
                // A .miz carries no airfield names, so ab.name is empty for
                // every real mission and this label was rendering as a bare
                // "Blue " with nothing after it.
                const markerLabel = `${t('common.blue')} ${ab.name || t('map.airbaseFallback', { id: ab.id })}`;
                return (
                  <Marker
                    key={`blue-airbase-${ab.id}`}
                    position={ab.latlon}
                    icon={createAirbaseIcon()}
                    alt={markerLabel}
                    title={markerLabel}
                  >
                    <Popup>{markerLabel}</Popup>
                  </Marker>
                );
              })}
              {viewMission.coalitions.red.airbases.map(ab => {
                if (!isResolvedLatLon(ab.latlon, ab.latlonResolved)) return null;
                const markerLabel = `${t('common.red')} ${ab.name || t('map.airbaseFallback', { id: ab.id })}`;
                return (
                  <Marker
                    key={`red-airbase-${ab.id}`}
                    position={ab.latlon}
                    icon={createAirbaseIcon()}
                    alt={markerLabel}
                    title={markerLabel}
                  >
                    <Popup>{markerLabel}</Popup>
                  </Marker>
                );
              })}
            </LayerGroup>
          )}

          {layers.flights && flightEntries.map(({ flight, side, index }) => (
            <FlightPath
              key={`${side}-${flight.groupId}-${index}`}
              flight={flight}
              side={side}
              color={getFlightColor(side)}
            />
          ))}

          {layers.zones && (
            <LayerGroup>
              {missionZones.map((zone, index) => (
                <TriggerZone key={`zone-${zone.zoneId}-${index}`} zone={zone} theatre={viewMission.meta.theatre} />
              ))}
            </LayerGroup>
          )}

          {layers.drawings && (
            <LayerGroup>
              {missionDrawings.map((drawing, index) => (
                <DrawingLayer key={`drawing-${drawing.layer}-${index}`} drawing={drawing} theatre={viewMission.meta.theatre} />
              ))}
            </LayerGroup>
          )}

          {layers.support && (
            <LayerGroup>
              {viewMission.coalitions.blue.support.map((support, index) => (
                <SupportMarker
                  key={`blue-support-${index}`}
                  support={support}
                  label={t('common.blue')}
                  theatre={viewMission.meta.theatre}
                  t={t}
                />
              ))}
              {viewMission.coalitions.red.support.map((support, index) => (
                <SupportMarker
                  key={`red-support-${index}`}
                  support={support}
                  label={t('common.red')}
                  theatre={viewMission.meta.theatre}
                  t={t}
                />
              ))}
              {viewMission.coalitions.neutral.support.map((support, index) => (
                <SupportMarker
                  key={`neutral-support-${index}`}
                  support={support}
                  label={t('common.neutral')}
                  theatre={viewMission.meta.theatre}
                  t={t}
                />
              ))}
            </LayerGroup>
          )}

          {layers.threats && (
            <LayerGroup>
              {viewMission.coalitions.red.aiGroups
                .filter(g => g.threatRange && g.threatRange > 0)
                .map((g, index) => {
                  const position = resolveEntityPosition(viewMission.meta.theatre, g.latlon, g.latlonResolved, g.position);
                  if (!position) return null;
                  const markerLabel = `${t('common.red')} ${g.type} threat range`;
                  return (
                    <Circle
                      key={`red-threat-${index}`}
                      center={position}
                      radius={g.threatRange!}
                      color={getThemeColor(THREAT_ENGAGEMENT_COLOR_TOKEN)}
                      fillColor={getThemeColor(THREAT_ENGAGEMENT_COLOR_TOKEN)}
                      fillOpacity={0.1}
                      weight={1}
                    >
                      <Popup>{`${markerLabel}: ${t('map.threatPopup', { type: g.type, range: g.threatRange })}`}</Popup>
                    </Circle>
                  );
                })}
              {viewMission.coalitions.neutral.aiGroups
                .filter(g => g.threatRange && g.threatRange > 0)
                .map((g, index) => {
                  const position = resolveEntityPosition(viewMission.meta.theatre, g.latlon, g.latlonResolved, g.position);
                  if (!position) return null;
                  const markerLabel = `${t('common.neutral')} ${g.type} threat range`;
                  return (
                    <Circle
                      key={`neutral-threat-${index}`}
                      center={position}
                      radius={g.threatRange!}
                      color={getThemeColor(NEUTRAL_FLIGHT_COLOR_TOKEN)}
                      fillColor={getThemeColor(NEUTRAL_FLIGHT_COLOR_TOKEN)}
                      fillOpacity={0.1}
                      weight={1}
                    >
                      <Popup>{`${markerLabel}: ${t('map.threatPopup', { type: g.type, range: g.threatRange })}`}</Popup>
                    </Circle>
                  );
                })}
            </LayerGroup>
          )}

          {layers.detection && (
            <LayerGroup>
              {viewMission.coalitions.red.aiGroups
                .filter(g => g.detectionRange && g.detectionRange > 0)
                .map((g, index) => {
                  const position = resolveEntityPosition(viewMission.meta.theatre, g.latlon, g.latlonResolved, g.position);
                  if (!position) return null;
                  const markerLabel = `${t('common.red')} ${g.type} detection range`;
                  return (
                    <Circle
                      key={`red-detection-${index}`}
                      center={position}
                      radius={g.detectionRange!}
                      color={getThemeColor(THREAT_DETECTION_COLOR_TOKEN)}
                      fill={false}
                      fillOpacity={0}
                      dashArray="8 6"
                      weight={1}
                    >
                      <Popup>{`${markerLabel}: ${t('map.detectionPopup', { type: g.type, range: g.detectionRange })}`}</Popup>
                    </Circle>
                  );
                })}
              {viewMission.coalitions.neutral.aiGroups
                .filter(g => g.detectionRange && g.detectionRange > 0)
                .map((g, index) => {
                  const position = resolveEntityPosition(viewMission.meta.theatre, g.latlon, g.latlonResolved, g.position);
                  if (!position) return null;
                  const markerLabel = `${t('common.neutral')} ${g.type} detection range`;
                  return (
                    <Circle
                      key={`neutral-detection-${index}`}
                      center={position}
                      radius={g.detectionRange!}
                      color={getThemeColor(NEUTRAL_FLIGHT_COLOR_TOKEN)}
                      fill={false}
                      fillOpacity={0}
                      dashArray="8 6"
                      weight={1}
                    >
                      <Popup>{`${markerLabel}: ${t('map.detectionPopup', { type: g.type, range: g.detectionRange })}`}</Popup>
                    </Circle>
                  );
                })}
            </LayerGroup>
          )}

          {layers.enemies && (
            <LayerGroup>
              {viewMission.coalitions.red.aiGroups.map((g, index) => {
                const position = resolveEntityPosition(viewMission.meta.theatre, g.latlon, g.latlonResolved, g.position);
                if (!position) return null;
                const markerLabel = `${t('common.red')} ${g.type} (${g.count})`;
                return (
                  <Marker
                    key={`red-enemy-${index}`}
                    position={position}
                    icon={createEnemyIcon()}
                    alt={markerLabel}
                    title={markerLabel}
                  >
                    <Popup>{`${t('common.red')}: ${t('map.enemyPopup', { type: g.type, count: g.count })}`}</Popup>
                  </Marker>
                );
              })}
              {viewMission.coalitions.neutral.aiGroups.map((g, index) => {
                const position = resolveEntityPosition(viewMission.meta.theatre, g.latlon, g.latlonResolved, g.position);
                if (!position) return null;
                const markerLabel = `${t('common.neutral')} ${g.type} (${g.count})`;
                return (
                  <Marker
                    key={`neutral-enemy-${index}`}
                    position={position}
                    icon={createEnemyIcon()}
                    alt={markerLabel}
                    title={markerLabel}
                  >
                    <Popup>{`${t('common.neutral')}: ${t('map.enemyPopup', { type: g.type, count: g.count })}`}</Popup>
                  </Marker>
                );
              })}
            </LayerGroup>
          )}
        </MapContainer>
      </div>
    </div>
  );
}

function MapViewport({ mission, includeDetectionRange }: { mission: MissionData; includeDetectionRange: boolean }) {
  const map = useMap();

  useEffect(() => {
    const bounds = collectMissionBounds(mission, includeDetectionRange);
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 12 });
    } else {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    }
  }, [includeDetectionRange, map, mission]);

  return null;
}

function collectMissionBounds(mission: MissionData, includeDetectionRange = false): L.LatLngBounds {
  const bounds = L.latLngBounds([]);
  const add = (coordinate: unknown, resolved?: boolean) => addLatLon(bounds, coordinate, resolved);
  const addDcs = (xy: LatLon) => {
    const coordinate = getDcsCoordinate(mission.meta.theatre, xy[0], xy[1]);
    if (coordinate) bounds.extend(coordinate);
    return coordinate;
  };

  const coalitions = [mission.coalitions.blue, mission.coalitions.red, mission.coalitions.neutral];
  for (const coalition of coalitions) {
    add(coalition.bullseye.latlon, coalition.bullseye.latlonResolved);
    for (const navPoint of coalition.navPoints) add(navPoint.latlon, navPoint.latlonResolved);
    for (const airbase of coalition.airbases) {
      add(airbase.latlon, airbase.latlonResolved);
      for (const runway of airbase.runways) add(runway.latlon);
    }
    for (const flight of coalition.flights) {
      for (const waypoint of flight.route) add(waypoint.latlon, waypoint.latlonResolved);
    }
    for (const support of coalition.support) {
      const coordinate = resolveEntityPosition(mission.meta.theatre, support.latlon, support.latlonResolved, support.position);
      if (coordinate) bounds.extend(coordinate);
      if (support.orbit) addDcs(support.orbit.point);
    }
    for (const group of coalition.aiGroups) {
      const coordinate = resolveEntityPosition(mission.meta.theatre, group.latlon, group.latlonResolved, group.position);
      if (coordinate) {
        bounds.extend(coordinate);
        if (group.threatRange && group.threatRange > 0) extendBoundsByMeters(bounds, coordinate, group.threatRange);
        if (includeDetectionRange && group.detectionRange && group.detectionRange > 0) {
          extendBoundsByMeters(bounds, coordinate, group.detectionRange);
        }
      }
    }
  }

  // Zones and ME drawings are mission-level data.  The normalizer exposes the
  // same arrays on each coalition for compatibility, but they are traversed
  // once here and once in the render tree.
  for (const zone of mission.coalitions.blue.zones) {
    const center = addDcs(zone.xy);
    if (center && zone.type === 0 && zone.radius > 0) extendBoundsByMeters(bounds, center, zone.radius);
    for (const vertex of zone.vertices ?? []) addDcs(vertex);
  }
  for (const drawing of mission.coalitions.blue.drawings) {
    if (!drawing.visible) continue;
    for (const object of drawing.objects) {
      for (const point of object.points) addDcs(point);
    }
  }

  return bounds;
}

function addLatLon(bounds: L.LatLngBounds, coordinate: unknown, resolved?: boolean): void {
  if (isResolvedLatLon(coordinate, resolved)) bounds.extend(coordinate);
}

function isResolvedLatLon(value: unknown, resolved?: boolean): value is LatLon {
  if (resolved === false || !Array.isArray(value) || value.length < 2) return false;
  const [lat, lon] = value;
  return typeof lat === 'number'
    && Number.isFinite(lat)
    && typeof lon === 'number'
    && Number.isFinite(lon)
    && (lat !== 0 || lon !== 0);
}

function getDcsCoordinate(theatre: string, x: number, y: number): LatLon | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const coordinate = dcsToLatLon(theatre, x, y);
  return isResolvedLatLon(coordinate) ? coordinate : null;
}

function resolveEntityPosition(theatre: string, latlon: unknown, latlonResolved: boolean | undefined, xy: LatLon): LatLon | null {
  if (latlonResolved === false) return null;
  if (isResolvedLatLon(latlon, latlonResolved)) return latlon;
  return getDcsCoordinate(theatre, xy[0], xy[1]);
}

function extendBoundsByMeters(bounds: L.LatLngBounds, center: LatLon, radius: number): void {
  if (!Number.isFinite(radius) || radius <= 0) return;
  const latitudeDelta = radius / 111_320;
  const longitudeScale = Math.max(Math.cos(center[0] * Math.PI / 180), 0.01);
  const longitudeDelta = radius / (111_320 * longitudeScale);
  bounds.extend([center[0] - latitudeDelta, center[1] - longitudeDelta]);
  bounds.extend([center[0] + latitudeDelta, center[1] + longitudeDelta]);
}

function getFlightColor(side: MapSide): string {
  if (side === 'blue') return getThemeColor(BLUE_FLIGHT_COLOR_TOKEN);
  if (side === 'red') return getThemeColor(RED_FLIGHT_COLOR_TOKEN);
  return getThemeColor(NEUTRAL_FLIGHT_COLOR_TOKEN);
}

function getFlightDashArray(side: MapSide): string | undefined {
  if (side === 'red') return '8 6';
  if (side === 'neutral') return '2 6';
  return undefined;
}

function getSideLabel(side: MapSide, t: TFunction): string {
  if (side === 'blue') return t('common.blue');
  if (side === 'red') return t('common.red');
  return t('common.neutral');
}

function FlightPath({ flight, side, color }: { flight: Flight; side: MapSide; color: string }) {
  const { t } = useTranslation();
  const sideLabel = getSideLabel(side, t);
  const flightLabel = flight.callsign || flight.name || `${sideLabel} flight`;
  const validWaypoints = flight.route.filter(waypoint => isResolvedLatLon(waypoint.latlon, waypoint.latlonResolved));
  const positions = validWaypoints.map(waypoint => waypoint.latlon);
  const dashArray = getFlightDashArray(side);

  return (
    <>
      {positions.length > 1 && (
        <Polyline positions={positions} color={color} weight={2} opacity={0.8} dashArray={dashArray} />
      )}
      {validWaypoints.map((waypoint, index) => {
        const markerLabel = `${sideLabel} ${flightLabel} waypoint ${waypoint.index}: ${waypoint.name}`;
        return (
          <Marker
            key={`${side}-${flight.groupId}-waypoint-${waypoint.index}-${index}`}
            position={waypoint.latlon}
            icon={createWaypointIcon(index + 1)}
            alt={markerLabel}
            title={markerLabel}
          >
            <Popup>{`${sideLabel} ${flightLabel}: ${t('map.waypoint', { name: waypoint.name, action: waypoint.action })}`}</Popup>
          </Marker>
        );
      })}
    </>
  );
}

function TriggerZone({ zone, theatre }: { zone: TriggerZone; theatre: string }) {
  const { t } = useTranslation();
  const color = dcsColorToCss(zone.color, getThemeColor(DEFAULT_ZONE_COLOR_TOKEN));

  if (zone.type === 0) {
    const center = getDcsCoordinate(theatre, zone.xy[0], zone.xy[1]);
    if (!center) return null;
    return (
      <Circle
        center={center}
        radius={zone.radius}
        color={color}
        fillColor={color}
        fillOpacity={0.1}
        weight={1}
        dashArray="5 5"
      >
        <Popup>{t('map.zone', { name: zone.name })}</Popup>
      </Circle>
    );
  }

  const positions = (zone.vertices ?? [])
    .map(vertex => getDcsCoordinate(theatre, vertex[0], vertex[1]))
    .filter((position): position is LatLon => position !== null);
  if (positions.length < 2) return null;
  return (
    <Polyline positions={positions} color={color} weight={2} fillColor={color} fillOpacity={0.1} dashArray="5 5">
      <Popup>{t('map.zone', { name: zone.name })}</Popup>
    </Polyline>
  );
}

function DrawingLayer({ drawing, theatre }: { drawing: Drawing; theatre: string }) {
  if (!drawing.visible) return null;

  return (
    <LayerGroup>
      {drawing.objects.map((object, index) => {
        const positions = object.points
          .map(point => getDcsCoordinate(theatre, point[0], point[1]))
          .filter((position): position is LatLon => position !== null);
        const key = `${drawing.layer}-${index}`;
        const color = object.color || getThemeColor(DEFAULT_DRAWING_COLOR_TOKEN);
        const fillColor = object.fillColor || color;

        if (object.primitiveType === 'Line') {
          return positions.length > 1 ? <Polyline key={key} positions={positions} color={color} weight={object.thickness} /> : null;
        }
        if (object.primitiveType === 'Polygon') {
          return positions.length > 1 ? (
            <Polyline key={key} positions={positions} color={color} weight={object.thickness} fillColor={fillColor} fillOpacity={0.2} />
          ) : null;
        }
        if (object.primitiveType === 'TextBox') {
          const position = positions[0];
          if (!position) return null;
          return (
            <Marker key={key} position={position} alt={object.name} title={object.name}>
              <Popup>{object.name}</Popup>
            </Marker>
          );
        }
        return null;
      })}
    </LayerGroup>
  );
}

function SupportMarker({ support, label, theatre, t }: { support: SupportAsset; label: string; theatre: string; t: TFunction }) {
  const position = resolveEntityPosition(theatre, support.latlon, support.latlonResolved, support.position);
  if (!position) return null;
  const markerLabel = `${label} ${support.kind}: ${support.callsign}`;

  return (
    <Marker position={position} icon={createSupportIcon(support.kind)} alt={markerLabel} title={markerLabel}>
      <Popup>{t('map.supportPopup', { side: label, kind: support.kind, callsign: support.callsign })}</Popup>
    </Marker>
  );
}

function dcsColorToCss(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim() !== '') return value;
  if (!Array.isArray(value) || value.length < 3) return fallback;
  const channels = value.slice(0, 3).map(channel => typeof channel === 'number' ? channel : Number(channel));
  if (channels.some(channel => !Number.isFinite(channel))) return fallback;
  const scale = Math.max(...channels) <= 1 ? 255 : 1;
  const rgb = channels.map(channel => Math.round(Math.min(1, Math.max(0, channel / scale)) * 255));
  const rawAlpha = value[3];
  const alphaValue = rawAlpha === undefined ? 1 : typeof rawAlpha === 'number' ? rawAlpha : Number(rawAlpha);
  if (!Number.isFinite(alphaValue)) return fallback;
  const alpha = Math.min(1, Math.max(0, alphaValue <= 1 ? alphaValue : alphaValue / 255));
  return alpha < 1 ? `rgba(${rgb.join(', ')}, ${alpha})` : `rgb(${rgb.join(', ')})`;
}

function createWaypointIcon(number: number) {
  const background = getThemeColor('--color-map-waypoint-background');
  const foreground = getThemeColor('--color-map-marker-foreground');
  const shadow = getThemeColor('--shadow-map-marker');
  return L.divIcon({
    className: 'waypoint-marker',
    html: `<div style="background: ${background}; color: ${foreground}; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; border: 2px solid ${foreground}; box-shadow: 0 1px 3px ${shadow};">${number}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function createAirbaseIcon() {
  const background = getThemeColor('--color-map-airbase');
  const foreground = getThemeColor('--color-map-marker-foreground');
  return L.divIcon({
    className: 'airbase-marker',
    html: `<div style="background: ${background}; color: ${foreground}; width: 20px; height: 20px; border-radius: 4px; transform: rotate(45deg); display: flex; align-items: center; justify-content: center; font-size: 10px;">✈</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function createEnemyIcon() {
  const background = getThemeColor('--color-map-enemy');
  const foreground = getThemeColor('--color-map-marker-foreground');
  const shadow = getThemeColor('--shadow-map-marker');
  return L.divIcon({
    className: 'enemy-marker',
    html: `<div style="background: ${background}; color: ${foreground}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid ${foreground}; box-shadow: 0 1px 3px ${shadow};"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function createSupportIcon(kind: string) {
  const icons: Record<string, string> = {
    tanker: '⛽',
    awacs: '📡',
    carrier: '🚢',
    jtac: '🎯',
  };
  const background = getThemeColor('--color-map-support');
  const foreground = getThemeColor('--color-map-marker-foreground');
  const shadow = getThemeColor('--shadow-map-marker');
  return L.divIcon({
    className: 'support-marker',
    html: `<div style="background: ${background}; color: ${foreground}; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; border: 2px solid ${foreground}; box-shadow: 0 1px 3px ${shadow};">${icons[kind] || '📍'}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function getLayerLabel(key: string, t: TFunction): string {
  const labelKeys: Record<string, string> = {
    flights: 'map.layers.flights',
    zones: 'map.layers.zones',
    drawings: 'map.layers.drawings',
    threats: 'map.layers.threats',
    detection: 'map.layers.detection',
    support: 'map.layers.support',
    enemies: 'map.layers.enemies',
    bullseye: 'map.layers.bullseye',
    navpoints: 'map.layers.navpoints',
    airbases: 'map.layers.airbases',
  };
  return labelKeys[key] ? t(labelKeys[key]) : key;
}
