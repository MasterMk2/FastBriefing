import type { AIGroup, DisplaySettings, MissionData, MissionMeta, SMEACNotes } from '../types/mission';
import type { WhiteboardData } from '../types/whiteboard';
import { buildMetar } from './metar';
import { formatLegDuration, formatRouteCoordinate } from './routeLegs';
import { etaZuluDate, formatDateYMD, formatTimeHHMM, formatTimeHHMMSS, formatUtcOffset, missionLocalDate, missionZuluDate } from './time';
import { formatAltitude, formatDistance, formatPressure, formatSpeed, formatTemperature } from './units';
import { waypointAnnotationKey } from './waypointAnnotations';

export type BriefingMarkdownTranslate = (key: string, options?: Record<string, string | number>) => string;

export function buildBriefingMarkdown(
  mission: MissionData,
  settings: DisplaySettings,
  whiteboard: WhiteboardData,
  t: BriefingMarkdownTranslate,
): string {
  const blocks: string[] = [`# ${mission.meta.sortie}\n`];
  for (const section of settings.briefingSections) {
    switch (section) {
      case 'overview': blocks.push(overviewMarkdown(mission, settings, t)); break;
      case 'notes': blocks.push(notesMarkdown(mission, t)); break;
      case 'flights': blocks.push(flightsMarkdown(mission, settings, t)); break;
      case 'map': blocks.push(mapMarkdown(mission, t)); break;
      case 'comms': blocks.push(commsMarkdown(mission, t)); break;
      case 'support': blocks.push(supportMarkdown(mission, t)); break;
      case 'threats': blocks.push(threatsMarkdown(mission, settings, t)); break;
      case 'whiteboard': blocks.push(whiteboardMarkdown(whiteboard, t)); break;
    }
  }
  return blocks.filter(Boolean).join('\n');
}

function overviewMarkdown(mission: MissionData, settings: DisplaySettings, t: BriefingMarkdownTranslate): string {
  const { meta, weather } = mission;
  const localDate = missionLocalDate(meta);
  const zuluDate = missionZuluDate(meta);
  const lines = [
    `## ${t('planner.sections.overview')}\n`,
    `**${t('export.markdown.view')}**: ${t(settings.viewMode === 'pilot' ? 'export.markdown.pilotView' : 'export.markdown.creatorView')}  `,
    `**${t('export.markdown.map')}**: ${meta.theatre}  `,
    `**${t('export.markdown.date')}**: ${formatDateYMD(localDate)}  `,
    `**${t('export.markdown.startLocal')}**: ${formatTimeHHMM(localDate)} (${formatUtcOffset(meta.utcOffset)})  `,
    `**${t('export.markdown.startZulu')}**: ${formatTimeHHMM(zuluDate)}Z\n`,
    `### ${t('export.markdown.weather')}\n`,
    `- **${t('export.markdown.temperature')}**: ${formatTemperature(weather.temperature, settings.temperatureUnit)}  `,
    `- **${t('export.markdown.qnh')}**: ${formatPressure(weather.qnh, settings.pressureUnit)}  `,
    `- **${t('export.markdown.visibility')}**: ${formatDistance(weather.visibility, settings.distanceUnit)}  `,
    `- **${t('export.markdown.clouds')}**: ${weather.clouds.label} (${t('export.markdown.cloudBase', { value: formatAltitude(weather.clouds.base, settings.altitudeUnit) })})  `,
    `- **${t('export.markdown.metar')}**: ${buildMetar(weather, { time: zuluDate })}\n`,
    `#### ${t('export.markdown.wind')}\n`,
    `| ${t('export.markdown.altitude')} | ${t('export.markdown.windFrom')} | ${t('export.markdown.windSpeed')} |\n|---|---:|---:|`,
    ...weather.wind.map(wind => `| ${wind.level === 'ground' ? t('export.markdown.ground') : `${wind.level}m`} | ${wind.from}° | ${formatSpeed(wind.speed, settings.speedUnit)} |`),
    '',
  ];
  return lines.join('\n');
}

function notesMarkdown(mission: MissionData, t: BriefingMarkdownTranslate): string {
  const lines = [`## ${t('planner.sections.notes')}\n`];
  for (const field of ['situation', 'mission', 'execution', 'adminLogistics', 'commandSignal'] as (keyof SMEACNotes)[]) {
    const value = mission.userNotes.smeac[field].trim();
    if (value) lines.push(`### ${t(`notes.smeac.${field}`)}\n\n${value}\n`);
  }
  for (const side of ['blue', 'red', 'neutral'] as const) {
    for (const flight of mission.coalitions[side].flights) {
      const notes = mission.userNotes.perFlight[`${side}:${flight.groupId}`];
      if (!notes) continue;
      const values = [
        notes.pilotName && `- **${t('notes.pilotName')}**: ${notes.pilotName}`,
        notes.tot && `- **${t('notes.tot')}**: ${notes.tot}`,
        notes.jokerFuel !== null && `- **${t('notes.jokerFuel')}**: ${notes.jokerFuel}`,
        notes.bingoFuel !== null && `- **${t('notes.bingoFuel')}**: ${notes.bingoFuel}`,
        notes.customNotes && `- **${t('notes.customNotes')}**: ${notes.customNotes}`,
      ].filter((value): value is string => Boolean(value));
      if (values.length) lines.push(`### ${flight.callsign || flight.name}\n\n${values.join('\n')}\n`);
    }
  }
  if (lines.length === 1) lines.push(`_${t('common.notAvailable')}_\n`);
  return lines.join('\n');
}

function flightsMarkdown(mission: MissionData, settings: DisplaySettings, t: BriefingMarkdownTranslate): string {
  const lines = [`## ${t('export.markdown.flightList')}\n`];
  for (const side of ['blue', 'red', 'neutral'] as const) {
    for (const flight of mission.coalitions[side].flights) {
      lines.push(`### ${side.toUpperCase()} - ${flight.callsign} (${flight.name}) [${flight.type} ×${flight.units.length}]\n`);
      lines.push(`- **${t('export.markdown.task')}**: ${flight.task}`);
      lines.push(`- **${t('export.markdown.groupFrequency')}**: ${(flight.frequency / 1_000_000).toFixed(3)} MHz (${flight.modulation === 0 ? 'AM' : 'FM'})\n`);
      lines.push(`#### ${t('export.markdown.route')}\n`);
      lines.push(`| # | ${t('export.markdown.name')} | ${t('export.markdown.type')} | ${t('waypoints.purpose')} | ${t('waypoints.notes')} | ${t('export.markdown.coordinate')} | ${t('export.markdown.altitude')} | ${t('export.markdown.speed')} | ${t('export.markdown.eta')} | ${t('flights.distance')} | ${t('flights.bearing')} | ${t('flights.legTime')} |\n|---|---|---|---|---|---|---|---|---|---|---|---|`);
      for (const [routeIndex, waypoint] of flight.route.entries()) {
        const annotation = mission.userNotes.waypoints[waypointAnnotationKey(side, flight.groupId, routeIndex)];
        const bearing = waypoint.leg
          ? waypoint.leg.magneticBearing === undefined
            ? t('flights.trueBearingOnly', { trueBearing: waypoint.leg.trueBearing.toFixed(0) })
            : t('flights.bearingValue', { trueBearing: waypoint.leg.trueBearing.toFixed(0), magneticBearing: waypoint.leg.magneticBearing.toFixed(0) })
          : '-';
        lines.push(`| ${waypoint.index} | ${tableValue(waypoint.name)} | ${tableValue(waypoint.action)} | ${tableValue(annotation?.purpose ?? '-')} | ${tableValue(annotation?.notes ?? '-')} | ${formatRouteCoordinate(waypoint, settings.coordinateFormat)} | ${formatAltitude(waypoint.alt, settings.altitudeUnit)} | ${formatSpeed(waypoint.speed, settings.speedUnit)} | ${formatEta(waypoint.eta, mission.meta)} | ${waypoint.leg ? formatDistance(waypoint.leg.distance, settings.distanceUnit) : '-'} | ${bearing} | ${formatLegDuration(waypoint.leg?.time)} |`);
      }
      lines.push('');
    }
  }
  if (lines.length === 1) lines.push(`_${t('flights.empty')}_\n`);
  return lines.join('\n');
}

function mapMarkdown(mission: MissionData, t: BriefingMarkdownTranslate): string {
  const pins = mission.userNotes.mapAnnotations.filter(annotation => annotation.kind === 'pin');
  const strokes = mission.userNotes.mapAnnotations.filter(annotation => annotation.kind === 'stroke');
  return [
    `## ${t('export.markdown.mapSection')}\n`,
    `- **${t('export.markdown.map')}**: ${mission.meta.theatre}`,
    t('export.markdown.mapExportNote'),
    ...(pins.length ? pins.map(pin => `- **${tableValue(pin.label)}**: ${tableValue(pin.notes || t('common.notAvailable'))}`) : []),
    ...(strokes.length ? [`- ${t('map.annotations.drawingsCount', { count: strokes.length })}`] : []),
    '',
  ].join('\n');
}

function commsMarkdown(mission: MissionData, t: BriefingMarkdownTranslate): string {
  const lines = [
    `## ${t('export.markdown.commsPlan')}\n`,
    `| ${t('export.markdown.callsign')} | ${t('export.markdown.side')} | CH | ${t('export.markdown.frequencyMHz')} | ${t('export.markdown.modulation')} | ${t('export.markdown.name')} |\n|---|---|---:|---:|---|---|`,
  ];
  for (const side of ['blue', 'red', 'neutral'] as const) {
    for (const flight of mission.coalitions[side].flights) {
      for (const radio of flight.units[0]?.radios ?? []) {
        lines.push(`| ${flight.callsign} | ${side} | ${radio.channel} | ${radio.frequency.toFixed(3)} | ${radio.modulation === 0 ? 'AM' : 'FM'} | ${tableValue(radio.name)} |`);
      }
    }
  }
  lines.push(`| ${t('export.markdown.guardUhf')} | ${t('export.markdown.all')} | - | 243.000 | AM | ${t('export.markdown.guard')} |`);
  lines.push(`| ${t('export.markdown.guardVhf')} | ${t('export.markdown.all')} | - | 121.500 | AM | ${t('export.markdown.guard')} |\n`);
  return lines.join('\n');
}

function supportMarkdown(mission: MissionData, t: BriefingMarkdownTranslate): string {
  const lines = [`## ${t('export.markdown.support')}\n`];
  const seen = new Set<string>();
  for (const side of ['blue', 'red', 'neutral'] as const) {
    for (const support of mission.coalitions[side].support) {
      const key = `${support.kind}:${support.callsign}:${support.position.join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let line = `- **${support.kind.toUpperCase()}**: ${support.callsign}`;
      if (support.frequency) line += ` - ${(support.frequency / 1_000_000).toFixed(3)} MHz`;
      if (support.tacan) line += ` - TACAN ${support.tacan.channel}`;
      lines.push(line);
    }
  }
  if (lines.length === 1) lines.push(t('support.none'));
  lines.push('');
  return lines.join('\n');
}

function threatsMarkdown(mission: MissionData, settings: DisplaySettings, t: BriefingMarkdownTranslate): string {
  const threats = mission.coalitions.red.aiGroups;
  const lines = [
    `## ${t('export.markdown.threats')}\n`,
    `| ${t('export.markdown.type')} | ${t('export.markdown.count')} | ${t('export.markdown.engagementRange')} | ${t('export.markdown.detectionRange')} |\n|---|---:|---:|---:|`,
  ];
  if (threats.length === 0) return `${lines[0]}\n${t('export.markdown.noThreats')}\n`;
  for (const group of threats) {
    lines.push(`| ${tableValue(group.type)} | ${group.count} | ${threatRange(group, 'threatRange', settings, t)} | ${threatRange(group, 'detectionRange', settings, t)} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function whiteboardMarkdown(whiteboard: WhiteboardData, t: BriefingMarkdownTranslate): string {
  const notes = whiteboard.notes.trim() || `_${t('export.markdown.noWhiteboardNotes')}_`;
  const drawing = whiteboard.strokes.length
    ? `\n\n_${t('export.markdown.whiteboardDrawing', { count: whiteboard.strokes.length })}_`
    : '';
  return `## ${t('export.markdown.whiteboard')}\n\n${notes}${drawing}\n`;
}

function threatRange(group: AIGroup, field: 'threatRange' | 'detectionRange', settings: DisplaySettings, t: BriefingMarkdownTranslate): string {
  const value = group[field];
  if (Number.isFinite(value) && (value ?? 0) > 0) return formatDistance(value!, settings.distanceUnit);
  return group.threatRangeSource === 'unknown' ? t('export.markdown.unrecorded') : t('export.markdown.none');
}

function formatEta(eta: number, meta: MissionMeta): string {
  return `${formatTimeHHMMSS(etaZuluDate(meta, eta))}Z`;
}

function tableValue(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
