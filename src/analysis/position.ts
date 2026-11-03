// Position check shared by lint L7 and the support and threat screens (P5), so that a position counted
// as unresolved here is the same one the screen shows as unresolved. The rule matches the map's
// (MapTab isResolvedLatLon): only latlonResolved === false, a missing latlon, or a non-finite latlon
// makes a position unresolved.
export interface PositionLike {
  latlon?: [number, number];
  latlonResolved?: boolean;
}

export function isPositionResolved<T extends PositionLike>(entity: T): entity is T & { latlon: [number, number] } {
  if (entity.latlonResolved === false) return false;
  const latlon = entity.latlon;
  return Array.isArray(latlon)
    && latlon.length >= 2
    && Number.isFinite(latlon[0])
    && Number.isFinite(latlon[1]);
}
