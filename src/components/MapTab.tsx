import { useEffect, useRef, useState } from 'react';
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
  
  const mapRef = useRef<L.Map | null>(null);
  
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
            <label key={key} className="layer-toggle">
              <input
                type="checkbox"
                checked={value}
                onChange={(e) => setLayers(prev => ({ ...prev, [key]: e.target.checked }))}
              />
              <span>{getLayerLabel(key)}</span>
            </label>
          ))}
        </div>
      </div>
      
      <div className="map-container" style={{ height: '600px' }}>
        <MapContainer
          center={center}
          zoom={zoom}
          scrollWheelZoom={true}
          ref={mapRef as React.RefObject<L.Map>}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {layers.bullseye && (
            <>
              <Marker position={mission.coalitions.blue.bullseye.latlon as [number, number]}>
                <Popup>Blue Bullseye</Popup>
              </Marker>
              <Marker position={mission.coalitions.red.bullseye.latlon as [number, number]}>
                <Popup>Red Bullseye</Popup>
              </Marker>
            </>
          )}
          
          {layers.navpoints && (
            <LayerGroup>
              {mission.coalitions.blue.navPoints.map(np => (
                <Marker key={np.index} position={np.latlon as [number, number]}>
                  <Popup>Blue NavPoint {np.index}: {np.name}</Popup>
                </Marker>
              ))}
              {mission.coalitions.red.navPoints.map(np => (
                <Marker key={`red-${np.index}`} position={np.latlon as [number, number]}>
                  <Popup>Red NavPoint {np.index}: {np.name}</Popup>
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
                <TriggerZone key={zone.zoneId} zone={zone} color="#0066ff" />
              ))}
              {mission.coalitions.red.zones.map(zone => (
                <TriggerZone key={`red-${zone.zoneId}`} zone={zone} color="#ff0000" />
              ))}
            </LayerGroup>
          )}
          
          {layers.drawings && (
            <LayerGroup>
              {mission.coalitions.blue.drawings.map((drawing, i) => (
                <DrawingLayer key={i} drawing={drawing} />
              ))}
              {mission.coalitions.red.drawings.map((drawing, i) => (
                <DrawingLayer key={`red-${i}`} drawing={drawing} />
              ))}
            </LayerGroup>
          )}
          
          {layers.support && (
            <LayerGroup>
              {mission.coalitions.blue.support.map((s, i) => (
                <SupportMarker key={i} support={s} label="Blue" />
              ))}
              {mission.coalitions.red.support.map((s, i) => (
                <SupportMarker key={`red-${i}`} support={s} label="Red" />
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
                    <Popup>{g.type} - {g.threatRange}m</Popup>
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
                  <Popup>{g.type} ×{g.count}</Popup>
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
  const validWaypoints = flight.route.filter(wp => wp.latlon[0] !== 0 || wp.latlon[1] !== 0);
  const positions = validWaypoints.map(wp => wp.latlon as [number, number]);
  
  return (
    <>
      <Polyline positions={positions} color={color} weight={2} opacity={0.8} />
      {validWaypoints.map((wp, i) => (
        <Marker key={i} position={wp.latlon as [number, number]} icon={createWaypointIcon(i + 1)}>
          <Popup>{wp.name} ({wp.action})</Popup>
        </Marker>
      ))}
    </>
  );
}

function TriggerZone({ zone, color }: { zone: { xy: [number, number]; radius: number; type: number; vertices?: [number, number][]; name: string }; color: string }) {
  const center = dcsToLatLon('Caucasus', zone.xy[0], zone.xy[1]) || [0, 0];
  
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
        <Popup>Zone: {zone.name}</Popup>
      </Circle>
    );
  }
  
  if (zone.vertices && zone.vertices.length > 0) {
    const positions = zone.vertices.map(v => dcsToLatLon('Caucasus', v[0], v[1]) as [number, number]);
    return (
      <Polyline positions={positions} color={color} weight={2} fillColor={color} fillOpacity={0.1} />
    );
  }
  
  return null;
}

function DrawingLayer({ drawing }: { drawing: { layer: string; visible: boolean; objects: { primitiveType: string; points: [number, number][]; color: string; fillColor?: string; thickness: number; name: string }[] } }) {
  if (!drawing.visible) return null;
  
  return (
    <LayerGroup>
      {drawing.objects.map((obj, i) => {
        const positions = obj.points.map(p => dcsToLatLon('Caucasus', p[0], p[1]) as [number, number]);
        
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

function SupportMarker({ support, label }: { support: { kind: string; callsign: string; position: [number, number] }; label: string }) {
  const position = dcsToLatLon('Caucasus', support.position[0], support.position[1]) as [number, number];
  
  return (
    <Marker position={position} icon={createSupportIcon(support.kind)}>
      <Popup>{label} {support.kind}: {support.callsign}</Popup>
    </Marker>
  );
}

function createWaypointIcon(number: number) {
  return new (window as any).L.DivIcon({
    className: 'waypoint-marker',
    html: `<div style="background: #333; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">${number}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function createAirbaseIcon() {
  return new (window as any).L.DivIcon({
    className: 'airbase-marker',
    html: '<div style="background: #4CAF50; color: white; width: 20px; height: 20px; border-radius: 4px; transform: rotate(45deg); display: flex; align-items: center; justify-content: center; font-size: 10px;">✈</div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function createEnemyIcon() {
  return new (window as any).L.DivIcon({
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
  return new (window as any).L.DivIcon({
    className: 'support-marker',
    html: `<div style="background: #FF9800; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">${icons[kind] || '📍'}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function getLayerLabel(key: string): string {
  const labels: Record<string, string> = {
    flights: 'フライト経路',
    zones: 'トリガーゾーン',
    drawings: 'ME描画',
    threats: '脅威リング',
    support: '支援機',
    enemies: '敵ユニット',
    bullseye: 'ブルズアイ',
    navpoints: 'ナビポイント',
    airbases: '飛行場',
  };
  return labels[key] || key;
}