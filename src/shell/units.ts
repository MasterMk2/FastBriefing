import { useTranslation } from 'react-i18next';
import { useSettings } from '../hooks/useSettings';
import { useMission } from './MissionContext';
import { resolveCoordinateFormat, formatCoordinate } from '../utils/coordinates';
import { formatEtaLocal, formatEtaZulu } from '../utils/time';
import { formatAltitude, formatDistance, formatPressure, formatSpeed, formatTemperature, windFromTo } from '../utils/units';
import type { PressureValues } from '../utils/units';

/**
 * Display formatting with the user's settings applied. Screens and the printed
 * material both use this, so a unit change shows the same value everywhere.
 * It selects units only; values are converted once by the normalizer.
 */
export interface Units {
  alt: (meters: number) => string;
  speed: (metersPerSecond: number) => string;
  distance: (meters: number) => string;
  pressure: (qnh: PressureValues) => string;
  temp: (celsius: number) => string;
  /** Format a latitude/longitude pair. aircraftType selects the default when the setting is 'aircraft'. */
  coord: (latlon: [number, number], aircraftType?: string | null) => string;
  /** Mission time after `elapsedSeconds`, in the chosen time display (local, Zulu or both, D6). */
  time: (elapsedSeconds: number) => string;
  /** Wind direction (degrees the wind blows toward) in the chosen wind display (D5). */
  wind: (directionTo: number) => string;
}

export function useUnits(): Units {
  const { t } = useTranslation('shell');
  const { settings } = useSettings();
  const { mission } = useMission();

  return {
    alt: meters => formatAltitude(meters, settings.altitudeUnit),
    speed: metersPerSecond => formatSpeed(metersPerSecond, settings.speedUnit),
    distance: meters => formatDistance(meters, settings.distanceUnit),
    pressure: qnh => formatPressure(qnh, settings.pressureUnit),
    temp: celsius => formatTemperature(celsius, settings.temperatureUnit),
    coord: (latlon, aircraftType) => formatCoordinate(
      latlon[0],
      latlon[1],
      resolveCoordinateFormat(settings.coordinateFormat, aircraftType),
    ),
    time: elapsedSeconds => {
      const local = formatEtaLocal(mission.meta, elapsedSeconds);
      const zulu = formatEtaZulu(mission.meta, elapsedSeconds);
      if (settings.timeDisplay === 'local') return t('shell:units.time.local', { value: local });
      if (settings.timeDisplay === 'zulu') return t('shell:units.time.zulu', { value: zulu });
      return t('shell:units.time.both', { local, zulu });
    },
    wind: directionTo => {
      const { from, to } = windFromTo(directionTo);
      const fromDeg = Math.round(from);
      const toDeg = Math.round(to);
      if (settings.windDisplay === 'from') return t('shell:units.wind.from', { deg: fromDeg });
      if (settings.windDisplay === 'to') return t('shell:units.wind.to', { deg: toDeg });
      return t('shell:units.wind.both', { from: fromDeg, to: toDeg });
    },
  };
}
