import type { DisplaySettings, Flight, MissionData, TriggerZone } from '../types/mission';
import { formatRouteCoordinate, formatLegDuration } from './routeLegs';
import { formatAltitude, formatDistance, formatPressure, formatSpeed, formatTemperature } from './units';
import { formatDateYMD, formatEtaZulu, formatTimeHHMM, missionLocalDate, missionZuluDate } from './time';
import { applyViewMode } from './viewMode';

export interface KneeboardSection {
  heading: string;
  lines: string[];
}

export type KneeboardPage =
  | { kind: 'text'; title: string; sections: KneeboardSection[] }
  | { kind: 'map'; title: string; flights: Flight[]; zones: TriggerZone[] };

export type KneeboardTranslate = (key: string, options?: Record<string, string | number>) => string;

const SMEAC_FIELDS = ['situation', 'mission', 'execution', 'adminLogistics', 'commandSignal'] as const;

export function planKneeboardPages(
  mission: MissionData,
  settings: DisplaySettings,
  t: KneeboardTranslate,
  aircraftType: string | null = null,
): KneeboardPage[] {
  const visible = applyViewMode(mission, settings.viewMode);
  const allFlights = [...visible.coalitions.blue.flights, ...visible.coalitions.red.flights];
  const flights = aircraftType ? allFlights.filter(flight => flight.type === aircraftType) : allFlights;
  const local = missionLocalDate(visible.meta);
  const zulu = missionZuluDate(visible.meta);
  const overview: KneeboardSection[] = [
    {
      heading: t('kneeboard.mission'),
      lines: [
        visible.meta.sortie || t('kneeboard.untitled'),
        `${visible.meta.theatre} · ${formatDateYMD(local)}`,
        `${formatTimeHHMM(local)} Local / ${formatTimeHHMM(zulu)}Z`,
      ],
    },
    {
      heading: t('kneeboard.weather'),
      lines: [
        `${t('overview.temperature')}: ${formatTemperature(visible.weather.temperature, settings.temperatureUnit)}`,
        `QNH: ${formatPressure(visible.weather.qnh, settings.pressureUnit)}`,
        `${t('overview.visibility')}: ${formatDistance(visible.weather.visibility, settings.distanceUnit)}`,
        `${t('overview.clouds')}: ${visible.weather.clouds.label} / ${formatAltitude(visible.weather.clouds.base, settings.altitudeUnit)}`,
        ...visible.weather.wind.map(wind => `${t(`overview.windLevels.${wind.level}`)}: ${wind.from}° / ${formatSpeed(wind.speed, settings.speedUnit)}`),
      ],
    },
  ];
  if (visible.meta.description.trim()) {
    overview.push({ heading: t('kneeboard.description'), lines: visible.meta.description.split(/\r?\n/) });
  }
  for (const field of SMEAC_FIELDS) {
    const content = visible.userNotes.smeac[field].trim();
    if (content) overview.push({ heading: t(`notes.smeac.${field}`), lines: content.split(/\r?\n/) });
  }

  const pages: KneeboardPage[] = [{ kind: 'text', title: t('kneeboard.overview'), sections: overview }];
  for (const flight of flights) {
    const side = visible.coalitions.blue.flights.includes(flight) ? 'blue' : 'red';
    const notes = visible.userNotes.perFlight[`${side}:${flight.groupId}`];
    const flightLines = [
      `${flight.callsign} · ${flight.type} ×${flight.units.length}`,
      `${t('export.markdown.task')}: ${flight.task}`,
      `${t('flights.frequency')}: ${(flight.frequency / 1_000_000).toFixed(3)} MHz`,
    ];
    if (notes?.pilotName) flightLines.push(`${t('notes.pilotName')}: ${notes.pilotName}`);
    if (notes?.tot) flightLines.push(`TOT: ${notes.tot}`);
    if (notes?.jokerFuel !== null && notes?.jokerFuel !== undefined) flightLines.push(`Joker: ${notes.jokerFuel}`);
    if (notes?.bingoFuel !== null && notes?.bingoFuel !== undefined) flightLines.push(`Bingo: ${notes.bingoFuel}`);
    const sections: KneeboardSection[] = [{ heading: t('kneeboard.flight'), lines: flightLines }];
    for (const point of flight.route) {
      const leg = point.leg;
      const bearing = leg
        ? `${leg.trueBearing.toFixed(0)}°T${leg.magneticBearing === undefined ? '' : ` / ${leg.magneticBearing.toFixed(0)}°M`}`
        : '-';
      sections.push({
        heading: `${point.index}. ${point.name || point.action || t('kneeboard.waypoint')}`,
        lines: [
          formatRouteCoordinate(point, settings.coordinateFormat),
          `${formatAltitude(point.alt, settings.altitudeUnit)} · ${formatSpeed(point.speed, settings.speedUnit)} · ${formatEtaZulu(visible.meta, point.eta)}Z`,
          `${t('flights.distance')}: ${leg ? formatDistance(leg.distance, settings.distanceUnit) : '-'} · ${t('flights.bearing')}: ${bearing}`,
          `${t('flights.legTime')}: ${formatLegDuration(leg?.time)} · ${t('flights.cumulativeDistance')}: ${leg ? formatDistance(leg.cumulativeDistance, settings.distanceUnit) : '-'}`,
        ],
      });
    }
    if (notes?.customNotes) sections.push({ heading: t('notes.customNotes'), lines: notes.customNotes.split(/\r?\n/) });
    pages.push({ kind: 'text', title: `${t('kneeboard.navlog')}: ${flight.callsign}`, sections });
  }

  const comms: KneeboardSection[] = flights.map(flight => ({
    heading: `${flight.callsign} · ${flight.type}`,
    lines: [
      `${t('flights.frequency')}: ${(flight.frequency / 1_000_000).toFixed(3)} MHz`,
      ...(flight.units[0]?.radios ?? []).map(radio =>
        `CH ${radio.channel}: ${radio.frequency.toFixed(3)} MHz ${radio.modulation === 0 ? 'AM' : 'FM'} ${radio.name}`),
    ],
  }));
  const support = [...visible.coalitions.blue.support, ...visible.coalitions.red.support]
    .filter(asset => asset.frequency > 0)
    .map(asset => `${asset.kind.toUpperCase()} ${asset.callsign}: ${(asset.frequency / 1_000_000).toFixed(3)} MHz${asset.tacan ? ` · TACAN ${asset.tacan.channel}` : ''}`);
  comms.push({ heading: t('export.markdown.support'), lines: support });
  comms.push({ heading: 'Guard', lines: ['UHF 243.000 MHz AM', 'VHF 121.500 MHz AM'] });
  pages.push({ kind: 'text', title: t('kneeboard.comms'), sections: comms });
  const mapGroups = Math.max(1, Math.ceil(flights.length / 4));
  const zones = [...visible.coalitions.blue.zones, ...visible.coalitions.red.zones];
  for (let index = 0; index < mapGroups; index += 1) {
    pages.push({
      kind: 'map',
      title: `${t('kneeboard.map')}${mapGroups > 1 ? ` ${index + 1}/${mapGroups}` : ''}`,
      flights: flights.slice(index * 4, (index + 1) * 4),
      zones,
    });
  }
  return pages;
}
