import type { DisplaySettings, Flight, MissionData } from '../types/mission';
import type { WhiteboardData } from '../types/whiteboard';
import type { BriefingSection } from './briefingSections';
import { buildMissionMapScene, type MissionMapScene } from './missionMapRaster';
import { waypointAnnotationKey } from './waypointAnnotations';
import { formatRouteCoordinate, formatLegDuration } from './routeLegs';
import { formatAltitude, formatDistance, formatPressure, formatSpeed, formatTemperature } from './units';
import { formatDateYMD, formatEtaZulu, formatTimeHHMM, missionLocalDate, missionZuluDate } from './time';
import { applyViewMode } from './viewMode';

export interface KneeboardSection {
  heading: string;
  /** Plain text fallback (used by the PNG renderer). Table rows are also written here as text. */
  lines: string[];
  /** Optional table for Markdown and print (P3). */
  table?: { header: string[]; rows: string[][] };
}

export type KneeboardPage =
  | { kind: 'text'; section: BriefingSection; title: string; sections: KneeboardSection[] }
  | { kind: 'map'; section: 'map'; title: string; scene: MissionMapScene }
  | { kind: 'whiteboard'; section: 'notes'; title: string; data: WhiteboardData };

export type KneeboardTranslate = (key: string, options?: Record<string, string | number>) => string;

const SMEAC_FIELDS = ['situation', 'mission', 'execution', 'adminLogistics', 'commandSignal'] as const;

/**
 * The old tab's planner (ExportTab.tsx). Every key is in the `legacy` namespace, the same namespace the
 * old tab used through its default, so the text does not change. It goes away with ExportTab.tsx.
 */
export function planKneeboardPages(
  mission: MissionData,
  settings: DisplaySettings,
  t: KneeboardTranslate,
  aircraftType: string | null = null,
  whiteboard: WhiteboardData = { notes: '', strokes: [] },
): KneeboardPage[] {
  const visible = applyViewMode(mission, settings.viewMode, settings.side);
  const allFlights = [
    ...visible.coalitions.blue.flights,
    ...visible.coalitions.red.flights,
    ...visible.coalitions.neutral.flights,
  ];
  const flights = aircraftType ? allFlights.filter(flight => flight.type === aircraftType) : allFlights;
  const pages: KneeboardPage[] = [];

  for (const section of settings.briefingSections) {
    switch (section) {
      case 'overview':
        pages.push(planOverview(visible, settings, t));
        break;
      case 'notes':
        pages.push(planNotes(visible, flights, t));
        pages.push({ kind: 'whiteboard', section, title: t('legacy:whiteboard.title'), data: whiteboard });
        break;
      case 'flights':
        pages.push(...planFlights(visible, flights, settings, t));
        break;
      case 'map': {
        const pageCount = Math.max(1, Math.ceil(flights.length / 4));
        for (let index = 0; index < pageCount; index += 1) {
          pages.push({
            kind: 'map',
            section,
            title: `${t('legacy:kneeboard.map')}${pageCount > 1 ? ` ${index + 1}/${pageCount}` : ''}`,
            scene: {
              ...buildMissionMapScene(visible, flights.slice(index * 4, (index + 1) * 4)),
              basemap: settings.mapBackground,
            },
          });
        }
        break;
      }
      case 'comms':
        pages.push(planComms(visible, flights, t));
        break;
      case 'support':
        pages.push(planSupport(visible, settings, t));
        break;
      case 'threats':
        pages.push(planThreats(visible, settings, t));
        break;
    }
  }
  return pages;
}

function planOverview(mission: MissionData, settings: DisplaySettings, t: KneeboardTranslate): KneeboardPage {
  const local = missionLocalDate(mission.meta);
  const zulu = missionZuluDate(mission.meta);
  const sections: KneeboardSection[] = [
    {
      heading: t('legacy:kneeboard.mission'),
      lines: [
        mission.meta.sortie || t('legacy:kneeboard.untitled'),
        `${mission.meta.theatre} · ${formatDateYMD(local)}`,
        `${formatTimeHHMM(local)} Local / ${formatTimeHHMM(zulu)}Z`,
      ],
    },
    {
      heading: t('legacy:kneeboard.weather'),
      lines: [
        `${t('legacy:overview.temperature')}: ${formatTemperature(mission.weather.temperature, settings.temperatureUnit)}`,
        `QNH: ${formatPressure(mission.weather.qnh, settings.pressureUnit)}`,
        `${t('legacy:overview.visibility')}: ${formatDistance(mission.weather.visibility, settings.distanceUnit)}`,
        `${t('legacy:overview.clouds')}: ${mission.weather.clouds.label} / ${formatAltitude(mission.weather.clouds.base, settings.altitudeUnit)}`,
        ...mission.weather.wind.map(wind => `${t(`legacy:overview.windLevels.${wind.level}`)}: ${wind.from}° / ${formatSpeed(wind.speed, settings.speedUnit)}`),
      ],
    },
  ];
  if (mission.meta.description.trim()) {
    sections.push({ heading: t('legacy:kneeboard.description'), lines: mission.meta.description.split(/\r?\n/) });
  }
  return { kind: 'text', section: 'overview', title: t('legacy:kneeboard.overview'), sections };
}

function planNotes(mission: MissionData, flights: Flight[], t: KneeboardTranslate): KneeboardPage {
  const sections: KneeboardSection[] = [];
  for (const field of SMEAC_FIELDS) {
    const content = mission.userNotes.smeac[field].trim();
    if (content) sections.push({ heading: t(`legacy:notes.smeac.${field}`), lines: content.split(/\r?\n/) });
  }
  for (const flight of flights) {
    const side = mission.coalitions.blue.flights.includes(flight)
      ? 'blue'
      : mission.coalitions.red.flights.includes(flight) ? 'red' : 'neutral';
    const notes = mission.userNotes.perFlight[`${side}:${flight.groupId}`];
    if (!notes) continue;
    const lines = [
      notes.pilotName && `${t('legacy:notes.pilotName')}: ${notes.pilotName}`,
      notes.tot && `TOT: ${notes.tot}`,
      notes.jokerFuel !== null && `Joker: ${notes.jokerFuel}`,
      notes.bingoFuel !== null && `Bingo: ${notes.bingoFuel}`,
      notes.customNotes,
    ].filter((line): line is string => Boolean(line));
    if (lines.length) sections.push({ heading: flight.callsign || flight.name, lines });
  }
  if (sections.length === 0) sections.push({ heading: t('legacy:notes.smeacTitle'), lines: [t('legacy:common.notAvailable')] });
  return { kind: 'text', section: 'notes', title: t('legacy:tabs.notes'), sections };
}

function planFlights(mission: MissionData, flights: Flight[], settings: DisplaySettings, t: KneeboardTranslate): KneeboardPage[] {
  if (flights.length === 0) {
    return [{ kind: 'text', section: 'flights', title: t('legacy:kneeboard.navlog'), sections: [{ heading: t('legacy:tabs.flights'), lines: [t('legacy:flights.empty')] }] }];
  }
  return flights.map(flight => {
    const side = mission.coalitions.blue.flights.includes(flight)
      ? 'blue'
      : mission.coalitions.red.flights.includes(flight) ? 'red' : 'neutral';
    const notes = mission.userNotes.perFlight[`${side}:${flight.groupId}`];
    const flightLines = [
      `${flight.callsign} · ${flight.type} ×${flight.units.length}`,
      `${t('legacy:export.markdown.task')}: ${flight.task}`,
      `${t('legacy:flights.frequency')}: ${(flight.frequency / 1_000_000).toFixed(3)} MHz`,
    ];
    if (notes?.pilotName) flightLines.push(`${t('legacy:notes.pilotName')}: ${notes.pilotName}`);
    if (notes?.tot) flightLines.push(`TOT: ${notes.tot}`);
    if (notes?.jokerFuel !== null && notes?.jokerFuel !== undefined) flightLines.push(`Joker: ${notes.jokerFuel}`);
    if (notes?.bingoFuel !== null && notes?.bingoFuel !== undefined) flightLines.push(`Bingo: ${notes.bingoFuel}`);
    const sections: KneeboardSection[] = [{ heading: t('legacy:kneeboard.flight'), lines: flightLines }];
    for (const [routeIndex, point] of flight.route.entries()) {
      const leg = point.leg;
      const bearing = leg
        ? `${leg.trueBearing.toFixed(0)}°T${leg.magneticBearing === undefined ? '' : ` / ${leg.magneticBearing.toFixed(0)}°M`}`
        : '-';
      const annotation = mission.userNotes.waypoints[waypointAnnotationKey(side, flight.groupId, routeIndex)];
      sections.push({
        heading: `${point.index}. ${point.name || point.action || t('legacy:kneeboard.waypoint')}`,
        lines: [
          formatRouteCoordinate(point, settings.coordinateFormat),
          `${formatAltitude(point.alt, settings.altitudeUnit)} · ${formatSpeed(point.speed, settings.speedUnit)} · ${formatEtaZulu(mission.meta, point.eta)}Z`,
          `${t('legacy:flights.distance')}: ${leg ? formatDistance(leg.distance, settings.distanceUnit) : '-'} · ${t('legacy:flights.bearing')}: ${bearing}`,
          `${t('legacy:flights.legTime')}: ${formatLegDuration(leg?.time)} · ${t('legacy:flights.cumulativeDistance')}: ${leg ? formatDistance(leg.cumulativeDistance, settings.distanceUnit) : '-'}`,
          ...(annotation?.purpose ? [`${t('legacy:waypoints.purpose')}: ${annotation.purpose}`] : []),
          ...(annotation?.notes ? annotation.notes.split(/\r?\n/) : []),
        ],
      });
    }
    if (notes?.customNotes) sections.push({ heading: t('legacy:notes.customNotes'), lines: notes.customNotes.split(/\r?\n/) });
    return { kind: 'text' as const, section: 'flights' as const, title: `${t('legacy:kneeboard.navlog')}: ${flight.callsign}`, sections };
  });
}

function planComms(mission: MissionData, flights: Flight[], t: KneeboardTranslate): KneeboardPage {
  const sections: KneeboardSection[] = flights.map(flight => ({
    heading: `${flight.callsign} · ${flight.type}`,
    lines: [
      `${t('legacy:flights.frequency')}: ${(flight.frequency / 1_000_000).toFixed(3)} MHz`,
      ...(flight.units[0]?.radios ?? []).map(radio =>
        `CH ${radio.channel}: ${radio.frequency.toFixed(3)} MHz ${radio.modulation === 0 ? 'AM' : 'FM'} ${radio.name}`),
    ],
  }));
  const support = getSupport(mission)
    .filter(asset => asset.frequency > 0)
    .map(asset => `${asset.kind.toUpperCase()} ${asset.callsign}: ${(asset.frequency / 1_000_000).toFixed(3)} MHz${asset.tacan ? ` · TACAN ${asset.tacan.channel}` : ''}`);
  sections.push({ heading: t('legacy:export.markdown.support'), lines: support.length ? support : [t('legacy:support.none')] });
  sections.push({ heading: 'Guard', lines: ['UHF 243.000 MHz AM', 'VHF 121.500 MHz AM'] });
  return { kind: 'text', section: 'comms', title: t('legacy:kneeboard.comms'), sections };
}

function planSupport(mission: MissionData, settings: DisplaySettings, t: KneeboardTranslate): KneeboardPage {
  const assets = getSupport(mission);
  const sections = assets.map(asset => ({
    heading: `${asset.kind.toUpperCase()} · ${asset.callsign}`,
    lines: [
      asset.frequency > 0 ? `${t('legacy:support.frequency')}: ${(asset.frequency / 1_000_000).toFixed(3)} MHz` : '',
      asset.tacan ? `TACAN: ${asset.tacan.channel} ${asset.tacan.mode}` : '',
      asset.orbit ? `${t('legacy:support.orbitAltitude')}: ${formatAltitude(asset.orbit.altitude, settings.altitudeUnit)}` : '',
      asset.orbit ? `${t('legacy:support.orbitSpeed')}: ${formatSpeed(asset.orbit.speed, settings.speedUnit)}` : '',
    ].filter(Boolean),
  }));
  if (sections.length === 0) sections.push({ heading: t('legacy:tabs.support'), lines: [t('legacy:support.none')] });
  return { kind: 'text', section: 'support', title: t('legacy:tabs.support'), sections };
}

function planThreats(mission: MissionData, settings: DisplaySettings, t: KneeboardTranslate): KneeboardPage {
  const groups = mission.coalitions.red.aiGroups;
  const sections = groups.map(group => ({
    heading: `${group.type} ×${group.count}`,
    lines: [
      `${t('legacy:threats.engagementRange')}: ${formatRange(group.threatRange, settings, t)}`,
      `${t('legacy:threats.detectionRange')}: ${formatRange(group.detectionRange, settings, t)}`,
    ],
  }));
  if (sections.length === 0) sections.push({ heading: t('legacy:tabs.threats'), lines: [t('legacy:threats.noThreats')] });
  return { kind: 'text', section: 'threats', title: t('legacy:tabs.threats'), sections };
}

function getSupport(mission: MissionData) {
  const seen = new Set<string>();
  return [
    ...mission.coalitions.blue.support,
    ...mission.coalitions.red.support,
    ...mission.coalitions.neutral.support,
  ].filter(asset => {
    const key = `${asset.kind}:${asset.callsign}:${asset.position.join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatRange(value: number | undefined, settings: DisplaySettings, t: KneeboardTranslate): string {
  return Number.isFinite(value) && (value ?? 0) > 0 ? formatDistance(value!, settings.distanceUnit) : t('legacy:threats.none');
}
