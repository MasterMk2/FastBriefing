import type { CoordinateFormat, MissionMeta, RoutePoint } from '../types/mission';
import { getMagneticVariation, trueToMagnetic } from './magvar';
import { calculateBearing, calculateDistance, formatCoordinate } from './coordinates';

/** DCS x points north and y points east; both are metres. */
export function calculateRouteLegs(route: RoutePoint[], meta: MissionMeta): RoutePoint[] {
  let cumulativeDistance = 0;
  let cumulativeTime: number | undefined = 0;
  const missionDate = new Date(Date.UTC(meta.date.Year, meta.date.Month - 1, meta.date.Day));

  return route.map((point, index) => {
    const previous = route[index - 1];
    if (!previous) return { ...point, leg: undefined };
    const north = point.xy[0] - previous.xy[0];
    const east = point.xy[1] - previous.xy[1];
    if (![north, east].every(Number.isFinite)) return { ...point, leg: undefined };

    const [previousLat, previousLon] = previous.latlon;
    const [lat, lon] = point.latlon;
    const hasPosition = previous.latlonResolved !== false && point.latlonResolved !== false
      && [previousLat, previousLon, lat, lon].every(Number.isFinite)
      && Math.abs(previousLat) <= 90 && Math.abs(lat) <= 90
      && Math.abs(previousLon) <= 180 && Math.abs(lon) <= 180;
    const distance = hasPosition
      ? calculateDistance(previousLat, previousLon, lat, lon)
      : Math.hypot(north, east);
    const trueBearing = hasPosition
      ? calculateBearing(previousLat, previousLon, lat, lon)
      : (Math.atan2(east, north) * 180 / Math.PI + 360) % 360;
    cumulativeDistance += distance;
    const time = Number.isFinite(point.speed) && point.speed > 0 ? distance / point.speed : undefined;
    cumulativeTime = cumulativeTime === undefined || time === undefined
      ? undefined
      : cumulativeTime + time;

    const magneticBearing = hasPosition
      ? trueToMagnetic(trueBearing, getMagneticVariation(meta.theatre, lat, lon, missionDate))
      : undefined;

    return {
      ...point,
      leg: { distance, trueBearing, magneticBearing, time, cumulativeDistance, cumulativeTime },
    };
  });
}

export function formatLegDuration(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '-';
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

export function formatRouteCoordinate(point: RoutePoint, format: CoordinateFormat): string {
  return point.latlonResolved === false
    ? `DCS X ${point.xy[0].toFixed(0)} m / Y ${point.xy[1].toFixed(0)} m`
    : formatCoordinate(point.latlon[0], point.latlon[1], format);
}
