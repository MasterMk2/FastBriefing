import type { DisplaySettings, MissionData } from '../types/mission';
import type { WhiteboardData } from '../types/whiteboard';
import { BRIEFING_SECTIONS, type BriefingSection } from './briefingSections';
import { formatDistance, formatPressure, formatTemperature } from './units';
import { buildMetar } from './metar';
import {
  formatDateYMD,
  formatTimeHHMM,
  formatUtcOffset,
  missionLocalDate,
  missionZuluDate,
} from './time';

export type BriefingPngTranslation = (
  key: string,
  options?: Record<string, string | number>,
) => string;

export interface BriefingPngSection {
  id: BriefingSection;
  title: string;
  lines: string[];
  includeWhiteboardDrawing: boolean;
}

export interface BriefingPngPage {
  sectionId: BriefingSection;
  title: string;
  lines: string[];
  drawWhiteboard: boolean;
}

export function buildBriefingPngSections(
  mission: MissionData,
  settings: DisplaySettings,
  whiteboard: WhiteboardData,
  t: BriefingPngTranslation,
): BriefingPngSection[] {
  const { meta, weather, coalitions } = mission;
  const localDate = missionLocalDate(meta);
  const zuluDate = missionZuluDate(meta);
  const flights = [
    ...coalitions.blue.flights.map(flight => ({ side: 'Blue', flight })),
    ...coalitions.red.flights.map(flight => ({ side: 'Red', flight })),
  ];
  const support = [
    ...coalitions.blue.support.map(asset => ({ side: 'Blue', asset })),
    ...coalitions.red.support.map(asset => ({ side: 'Red', asset })),
  ];
  const threats = coalitions.red.aiGroups.filter(group => {
    const category = group.category.trim().toLowerCase();
    return (group.threatRange ?? 0) > 0
      || (group.detectionRange ?? 0) > 0
      || category === 'vehicle'
      || category === 'ship';
  });

  const sections: Record<BriefingSection, BriefingPngSection> = {
    overview: {
      id: 'overview',
      title: t('planner.sections.overview'),
      includeWhiteboardDrawing: false,
      lines: [
        t('export.canvas.map', { value: meta.theatre }),
        t('export.canvas.date', { value: formatDateYMD(localDate) }),
        t('export.canvas.local', { value: `${formatTimeHHMM(localDate)} (${formatUtcOffset(meta.utcOffset)})` }),
        t('export.canvas.zulu', { value: `${formatTimeHHMM(zuluDate)}Z` }),
        '',
        t('export.canvas.weather'),
        t('export.canvas.temperature', { value: formatTemperature(weather.temperature, settings.temperatureUnit) }),
        t('export.canvas.qnh', { value: formatPressure(weather.qnh, settings.pressureUnit) }),
        t('export.canvas.visibility', { value: formatDistance(weather.visibility, settings.distanceUnit) }),
        t('export.canvas.clouds', { value: weather.clouds.label }),
        t('export.canvas.metar', { value: buildMetar(weather, { time: zuluDate }) }),
      ],
    },
    flights: {
      id: 'flights',
      title: t('export.markdown.flightList'),
      includeWhiteboardDrawing: false,
      lines: flights.length > 0
        ? flights.flatMap(({ side, flight }) => [
          `${side} | ${flight.callsign} | ${flight.type} ×${flight.units.length} | ${flight.task}`,
          t('export.canvas.flightDetails', {
            routeCount: flight.route.length,
            frequency: (flight.frequency / 1_000_000).toFixed(3),
            modulation: flight.modulation === 0 ? 'AM' : 'FM',
          }),
          '',
        ])
        : [t('export.canvas.noFlights')],
    },
    map: {
      id: 'map',
      title: t('export.markdown.mapSection'),
      includeWhiteboardDrawing: false,
      lines: [
        t('export.canvas.map', { value: meta.theatre }),
        t('export.canvas.mapDetails', {
          routeCount: flights.reduce((sum, { flight }) => sum + flight.route.length, 0),
          zoneCount: Object.values(coalitions).reduce((sum, coalition) => sum + coalition.zones.length, 0),
          drawingCount: Object.values(coalitions).reduce((sum, coalition) => sum + coalition.drawings.length, 0),
        }),
        t('export.markdown.mapScreenNote'),
      ],
    },
    comms: {
      id: 'comms',
      title: t('export.markdown.commsPlan'),
      includeWhiteboardDrawing: false,
      lines: [
        ...flights.flatMap(({ side, flight }) => {
          const radios = flight.units[0]?.radios ?? [];
          return radios.map(radio => (
            `${flight.callsign} | ${side} | CH ${radio.channel} | ${radio.frequency.toFixed(3)} MHz ${radio.modulation === 0 ? 'AM' : 'FM'} | ${radio.name}`
          ));
        }),
        'Guard (UHF) | 243.000 MHz AM',
        'Guard (VHF) | 121.500 MHz AM',
      ],
    },
    support: {
      id: 'support',
      title: t('export.markdown.support'),
      includeWhiteboardDrawing: false,
      lines: support.length > 0
        ? support.map(({ side, asset }) => [
          side,
          asset.kind.toUpperCase(),
          asset.callsign,
          asset.frequency ? `${(asset.frequency / 1_000_000).toFixed(3)} MHz` : '',
          asset.tacan ? `TACAN ${asset.tacan.channel}` : '',
        ].filter(Boolean).join(' | '))
        : [t('export.canvas.noSupport')],
    },
    threats: {
      id: 'threats',
      title: t('export.markdown.threats'),
      includeWhiteboardDrawing: false,
      lines: threats.length > 0
        ? threats.map(group => t('export.canvas.threat', {
          type: group.type,
          count: group.count,
          engagement: (group.threatRange ?? 0) > 0
            ? formatDistance(group.threatRange!, settings.distanceUnit)
            : t('export.markdown.unrecorded'),
          detection: (group.detectionRange ?? 0) > 0
            ? formatDistance(group.detectionRange!, settings.distanceUnit)
            : t('export.markdown.unrecorded'),
        }))
        : [t('export.markdown.noThreats')],
    },
    whiteboard: {
      id: 'whiteboard',
      title: t('export.markdown.whiteboard'),
      includeWhiteboardDrawing: true,
      lines: whiteboard.notes.trim()
        ? whiteboard.notes.trim().split(/\r?\n/)
        : [t('export.markdown.noWhiteboardNotes')],
    },
  };

  return BRIEFING_SECTIONS
    .filter(section => settings.briefingSections.includes(section))
    .map(section => sections[section]);
}

export function wrapBriefingPngLines(
  lines: readonly string[],
  measure: (text: string) => number,
  maxWidth: number,
): string[] {
  const wrapped: string[] = [];

  for (const sourceLine of lines) {
    if (!sourceLine) {
      wrapped.push('');
      continue;
    }

    let line = '';
    for (const character of Array.from(sourceLine)) {
      const candidate = line + character;
      if (line && measure(candidate) > maxWidth) {
        wrapped.push(line);
        line = character;
      } else {
        line = candidate;
      }
    }
    wrapped.push(line);
  }

  return wrapped;
}

export function paginateBriefingPngSection(
  section: BriefingPngSection,
  wrappedLines: readonly string[],
  textLinesPerPage = 36,
  whiteboardFirstPageLines = 9,
): BriefingPngPage[] {
  const pages: BriefingPngPage[] = [];
  let offset = 0;

  if (section.includeWhiteboardDrawing) {
    pages.push({
      sectionId: section.id,
      title: section.title,
      lines: wrappedLines.slice(0, whiteboardFirstPageLines),
      drawWhiteboard: true,
    });
    offset = whiteboardFirstPageLines;
  }

  while (offset < wrappedLines.length || pages.length === 0) {
    pages.push({
      sectionId: section.id,
      title: section.title,
      lines: wrappedLines.slice(offset, offset + textLinesPerPage),
      drawWhiteboard: false,
    });
    offset += textLinesPerPage;
  }

  return pages;
}
