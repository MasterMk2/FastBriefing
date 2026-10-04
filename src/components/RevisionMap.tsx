import { Fragment, useEffect, useMemo } from 'react';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LatLngTuple } from 'leaflet';
import { useTranslation } from 'react-i18next';
import 'leaflet/dist/leaflet.css';
import { dcsToLatLon } from '../utils/coordinates';
import type { RevisionRoute } from '../utils/missionRevision';

function FitBounds({ points }: { points: LatLngTuple[] }) {
  const map = useMap();
  useEffect(() => { if (points.length) map.fitBounds(points, { padding: [24, 24], maxZoom: 12 }); }, [map, points]);
  return null;
}
export default function RevisionMap({ theatre, routes }: { theatre: string; routes: RevisionRoute[] }) {
  const { t } = useTranslation();
  const layers = useMemo(() => routes.flatMap(route => (['before', 'after'] as const).map(version => ({
    name: route.name, version,
    points: route[version].map(point => {
      const { x, y } = point.data;
      const position = typeof x === 'number' && typeof y === 'number' ? dcsToLatLon(theatre, x, y) : null;
      return { name: `WP ${point.index} ${point.name}`, position };
    }),
  }))), [routes, theatre]);
  const points = useMemo(() => layers.flatMap(layer => layer.points.flatMap(point => point.position && point.position.every(Number.isFinite) ? [point.position] : [])), [layers]);
  if (!points.length) return <p>{t('revision.mapUnavailable')}</p>;
  return <div className="revision-map-section">
    <h3>{t('revision.mapTitle')}</h3>
    <p>{t('revision.mapLegend')}</p>
    <MapContainer center={points[0]} zoom={7} className="revision-map" aria-label={t('revision.mapTitle')}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitBounds points={points} />
      {layers.map((layer, index) => {
        const color = layer.version === 'before' ? '#b54b12' : '#167a49';
        // Break at unresolved points rather than inventing a connecting segment.
        return <Fragment key={index}>
          {layer.points.map((point, i) => {
            if (!point.position || !point.position.every(Number.isFinite)) return null;
            const previous = layer.points[i - 1]?.position;
            return <Fragment key={i}>
              {previous && previous.every(Number.isFinite) && <Polyline positions={[previous, point.position]} pathOptions={{ color, dashArray: layer.version === 'before' ? '8 6' : undefined }} />}
              <CircleMarker center={point.position} radius={layer.version === 'before' ? 7 : 4} pathOptions={{ color }}>
                <Popup>{t(`revision.${layer.version}`)}: {layer.name}<br />{point.name}</Popup>
              </CircleMarker>
            </Fragment>;
          })}
        </Fragment>;
      })}
    </MapContainer>
  </div>;
}
