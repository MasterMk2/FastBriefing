import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, LayerGroup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { MissionData, DisplaySettings } from '../types/mission';
import { dcsToLatLon } from '../utils/coordinates';

interface MapTabProps {
  mission: MissionData;
  settings: DisplaySettings;
}

const DEFAULT_CENTER: [number, number] = [42.0, 43.0];
const DEFAULT_ZOOM = 7;

export default function MapTab({ mission, settings }: MapTabProps) {
  const { t } = useTranslation();
  void settings;
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [layers, setLayers] = useState({
    flights: true,
    zones: true,
    drawings: true,
    threats: true,
    support: true,
    enemies: true,
    bullseye: true,
    navpoints: true,
    airbases: true,
  });
  
  useEffect(() => {
    if (mission.coalitions.blue.flights.length > 0) {
      const firstWp = mission.coalitions.blue.flights[0].route[0];
      if (firstWp) {
        setCenter(firstWp.latlon as [number, number]);
        setZoom(9);
      }
    } else if (mission.coalitions.red.flights.length > 0) {
      const firstWp = mission.coalitions.red.flights[0].route[0];
      if (firstWp) {
        setCenter(firstWp.latlon as [number, number]);
        setZoom(9);
      }
    }
  }, [mission]);
  
  const allFlights = [...mission.coalitions.blue.flights, ...mission.coalitions.red.flights];
  
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
      </div>
      
      <div className="map-container" style={{ height: '600px' }}>
        <MapContainer
          center={center}
          zoom={zoom}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {layers.bullseye && (
            <>
              <Marker position={mission.coalitions.blue.bullseye.latlon as [number, number]}>
                <Popup>{t('map.blueBullseye')}</Popup>
              </Marker>
              <Marker position={mission.coalitions.red.bullseye.latlon as [number, number]}>
                <Popup>{t('map.redBullseye')}</Popup>
              </Marker>
            </>
          )}
          
          {layers.navpoints && (
            <LayerGroup>
              {mission.coalitions.blue.navPoints.map(np => (
                <Marker key={np.index} position={np.latlon as [number, number]}>
                  <Popup>{t('map.blueNavPoint', { index: np.index, name: np.name })}</Popup>
                </Marker>
              ))}
              {mission.coalitions.red.navPoints.map(np => (
                <Marker key={`red-${np.index}`} position={np.latlon as [number, number]}>
                  <Popup>{t('map.redNavPoint', { index: np.index, name: np.name })}</Popup>
                </Marker>
              ))}
            </LayerGroup>
          )}
          
          {layers.airbases && (
            <LayerGroup>
              {mission.coalitions.blue.airbases.map(ab => (
                <Marker key={ab.id} position={ab.latlon as [number, number]} icon={createAirbaseIcon()}>
                  <Popup>{ab.name}</Popup>
                </Marker>
              ))}
              {mission.coalitions.red.airbases.map(ab => (
                <Marker key={`red-${ab.id}`} position={ab.latlon as [number, number]} icon={createAirbaseIcon()}>
                  <Popup>{ab.name}</Popup>
                </Marker>
              ))}
            </LayerGroup>
          )}
          
          {layers.flights && allFlights.map(flight => (
            <FlightPath key={flight.groupId} flight={flight} color={mission.coalitions.blue.flights.includes(flight) ? '#0066ff' : '#ff0000'} />
          ))}
          
          {layers.zones && (
            <LayerGroup>
              {mission.coalitions.blue.zones.map(zone => (
                <TriggerZone key={zone.zoneId} zone={zone} color="#0066ff" theatre={mission.meta.theatre} />
              ))}
              {mission.coalitions.red.zones.map(zone => (
                <TriggerZone key={`red-${zone.zoneId}`} zone={zone} color="#ff0000" theatre={mission.meta.theatre} />
              ))}
            </LayerGroup>
          )}
          
          {layers.drawings && (
            <LayerGroup>
              {mission.coalitions.blue.drawings.map((drawing, i) => (
                <DrawingLayer key={i} drawing={drawing} theatre={mission.meta.theatre} />
              ))}
              {mission.coalitions.red.drawings.map((drawing, i) => (
                <DrawingLayer key={`red-${i}`} drawing={drawing} theatre={mission.meta.theatre} />
              ))}
            </LayerGroup>
          )}
          
          {layers.support && (
            <LayerGroup>
              {mission.coalitions.blue.support.map((s, i) => (
                <SupportMarker key={i} support={s} label={t('common.blue')} theatre={mission.meta.theatre} t={t} />
              ))}
              {mission.coalitions.red.support.map((s, i) => (
                <SupportMarker key={`red-${i}`} support={s} label={t('common.red')} theatre={mission.meta.theatre} t={t} />
              ))}
            </LayerGroup>
          )}
          
          {layers.threats && (
            <LayerGroup>
              {mission.coalitions.red.aiGroups
                .filter(g => g.threatRange && g.threatRange > 0)
                .map((g, i) => (
                  <Circle
                    key={i}
                    center={dcsToLatLon(mission.meta.theatre, g.position[0], g.position[1]) as [number, number]}
                    radius={g.threatRange!}
                    color="#ff0000"
                    fillColor="#ff0000"
                    fillOpacity={0.1}
                    weight={1}
                  >
                    <Popup>{t('map.threatPopup', { type: g.type, range: g.threatRange })}</Popup>
                  </Circle>
                ))}
            </LayerGroup>
          )}
          
          {layers.enemies && (
            <LayerGroup>
              {mission.coalitions.red.aiGroups.map((g, i) => (
                <Marker
                  key={i}
                  position={dcsToLatLon(mission.meta.theatre, g.position[0], g.position[1]) as [number, number]}
                  icon={createEnemyIcon()}
                >
                  <Popup>{t('map.enemyPopup', { type: g.type, count: g.count })}</Popup>
                </Marker>
              ))}
            </LayerGroup>
          )}
        </MapContainer>
      </div>
    </div>
  );
}

function FlightPath({ flight, color }: { flight: { route: { latlon: [number, number]; name: string; action: string }[] }; color: string }) {
  const { t } = useTranslation();
  const validWaypoints = flight.route.filter(wp => wp.latlon[0] !== 0 || wp.latlon[1] !== 0);
  const positions = validWaypoints.map(wp => wp.latlon as [number, number]);
  
  return (
    <>
      <Polyline positions={positions} color={color} weight={2} opacity={0.8} />
      {validWaypoints.map((wp, i) => (
        <Marker key={i} position={wp.latlon as [number, number]} icon={createWaypointIcon(i + 1)}>
          <Popup>{t('map.waypoint', { name: wp.name, action: wp.action })}</Popup>
        </Marker>
      ))}
    </>
  );
}

function TriggerZone({ zone, color, theatre }: { zone: { xy: [number, number]; radius: number; type: number; vertices?: [number, number][]; name: string }; color: string; theatre: string }) {
  const { t } = useTranslation();
  const center = dcsToLatLon(theatre, zone.xy[0], zone.xy[1]) || [0, 0];
  
  if (zone.type === 0) {
    return (
      <Circle
        center={center as [number, number]}
        radius={zone.radius}
        color={color}
        fillColor={color}
        fillOpacity={0.1}
        weight={1}
        dashArray="5, 5"
      >
        <Popup>{t('map.zone', { name: zone.name })}</Popup>
      </Circle>
    );
  }
  
  if (zone.vertices && zone.vertices.length > 0) {
    const positions = zone.vertices.map(v => dcsToLatLon(theatre, v[0], v[1]) as [number, number]);
    return (
      <Polyline positions={positions} color={color} weight={2} fillColor={color} fillOpacity={0.1} />
    );
  }
  
  return null;
}

function DrawingLayer({ drawing, theatre }: { drawing: { layer: string; visible: boolean; objects: { primitiveType: string; points: [number, number][]; color: string; fillColor?: string; thickness: number; name: string }[] }; theatre: string }) {
  if (!drawing.visible) return null;
  
  return (
    <LayerGroup>
      {drawing.objects.map((obj, i) => {
        const positions = obj.points.map(p => dcsToLatLon(theatre, p[0], p[1]) as [number, number]);
        
        if (obj.primitiveType === 'Line') {
          return <Polyline key={i} positions={positions} color={obj.color} weight={obj.thickness} />;
        }
        if (obj.primitiveType === 'Polygon') {
          return <Polyline key={i} positions={positions} color={obj.color} weight={obj.thickness} fillColor={obj.fillColor} fillOpacity={0.2} />;
        }
        if (obj.primitiveType === 'TextBox') {
          return positions[0] ? (
            <Marker key={i} position={positions[0]}>
              <Popup>{obj.name}</Popup>
            </Marker>
          ) : null;
        }
        return null;
      })}
    </LayerGroup>
  );
}

function SupportMarker({ support, label, theatre, t }: { support: { kind: string; callsign: string; position: [number, number] }; label: string; theatre: string; t: TFunction }) {
  const position = dcsToLatLon(theatre, support.position[0], support.position[1]) as [number, number];
  
  return (
    <Marker position={position} icon={createSupportIcon(support.kind)}>
      <Popup>{t('map.supportPopup', { side: label, kind: support.kind, callsign: support.callsign })}</Popup>
    </Marker>
  );
}

function createWaypointIcon(number: number) {
  return L.divIcon({
    className: 'waypoint-marker',
    html: `<div style="background: #333; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">${number}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function createAirbaseIcon() {
  return L.divIcon({
    className: 'airbase-marker',
    html: '<div style="background: #4CAF50; color: white; width: 20px; height: 20px; border-radius: 4px; transform: rotate(45deg); display: flex; align-items: center; justify-content: center; font-size: 10px;">✈</div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function createEnemyIcon() {
  return L.divIcon({
    className: 'enemy-marker',
    html: '<div style="background: #f44336; color: white; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>',
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
  return L.divIcon({
    className: 'support-marker',
    html: `<div style="background: #FF9800; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">${icons[kind] || '📍'}</div>`,
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
    support: 'map.layers.support',
    enemies: 'map.layers.enemies',
    bullseye: 'map.layers.bullseye',
    navpoints: 'map.layers.navpoints',
    airbases: 'map.layers.airbases',
  };
  return labelKeys[key] ? t(labelKeys[key]) : key;
}
