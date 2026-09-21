import { describe, expect, it } from 'vitest';
import type { MissionData } from '../types/mission';
import { buildGeospatialExport, toGeoJson, toKml } from './geospatialExport';

function missionFixture(theatre = 'Caucasus'): MissionData {
  const visibleFlight = {
    groupId: 4, name: 'Viper & <Lead>', callsign: 'Viper 1', hidden: false,
    route: [
      { latlon: [41, 42], latlonResolved: true },
      { latlon: [41.5, 42.5], latlonResolved: true },
    ],
  };
  const hiddenFlight = { ...visibleFlight, groupId: 5, name: 'Hidden', hidden: true };
  const circle = { zoneId: 1, name: 'Circle', type: 0, xy: [0, 0], radius: 1000, hidden: false };
  const polygon = {
    zoneId: 2, name: 'Polygon', type: 2, xy: [0, 0], radius: 0, hidden: false,
    vertices: [[0, 0], [1000, 0], [0, 1000]],
  };
  const hiddenZone = { ...circle, zoneId: 3, name: 'Hidden zone', hidden: true };
  const emptyCoalition = () => ({ flights: [], zones: [], support: [], aiGroups: [], drawings: [] });
  return {
    meta: { theatre },
    coalitions: {
      blue: { ...emptyCoalition(), flights: [visibleFlight, hiddenFlight], zones: [circle, polygon, hiddenZone] },
      red: emptyCoalition(),
      neutral: emptyCoalition(),
    },
  } as unknown as MissionData;
}

describe('geospatial export', () => {
  it('exports WGS84 lon/lat routes and closed zone polygons', () => {
    const result = buildGeospatialExport(missionFixture(), 'pilot');
    expect(result.skipped).toBe(0);
    expect(result.features).toHaveLength(3);
    expect(result.features[0].geometry).toEqual({ type: 'LineString', coordinates: [[42, 41], [42.5, 41.5]] });
    const circle = result.features[1].geometry;
    expect(circle.type).toBe('Polygon');
    if (circle.type === 'Polygon') {
      expect(circle.coordinates[0]).toHaveLength(65);
      expect(circle.coordinates[0][0]).toEqual(circle.coordinates[0][64]);
    }
    const polygon = result.features[2].geometry;
    expect(polygon.type).toBe('Polygon');
    if (polygon.type === 'Polygon') expect(polygon.coordinates[0][0]).toEqual(polygon.coordinates[0][3]);
    expect(JSON.parse(toGeoJson(result)).features).toHaveLength(3);
  });

  it('filters hidden features for pilots and escapes KML names', () => {
    const pilot = buildGeospatialExport(missionFixture(), 'pilot');
    const creator = buildGeospatialExport(missionFixture(), 'creator');
    expect(pilot.features).toHaveLength(3);
    expect(creator.features).toHaveLength(5);
    expect(toKml(pilot)).toContain('<name>Viper &amp; &lt;Lead&gt;</name>');
    expect(toKml(pilot)).toContain('<coordinates>42,41 42.5,41.5</coordinates>');
  });

  it('skips unresolved coordinates instead of exporting a false zero point', () => {
    const mission = missionFixture('Unknown theatre');
    mission.coalitions.blue.flights[0].route[0].latlonResolved = false;
    const result = buildGeospatialExport(mission, 'pilot');
    expect(result.features).toHaveLength(0);
    expect(result.skipped).toBe(3);
  });
});
