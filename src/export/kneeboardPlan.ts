import type { DisplaySettings, Flight, MissionData, RoutePoint, Side, SupportAsset } from '../types/mission';
import type { BriefingSection } from '../utils/briefingSections';
import type { WhiteboardData } from '../types/whiteboard';
import type { KneeboardPage, KneeboardSection, KneeboardTranslate } from '../utils/kneeboard';
import { buildMetar } from '../utils/metar';
import { PROJECTIONS, formatCoordinate, resolveCoordinateFormat } from '../utils/coordinates';
import { buildMissionMapScene } from '../utils/missionMapRaster';
import { formatDateYMD, formatEtaLocal, formatEtaZulu, formatTimeHHMM, formatUtcOffset, missionLocalDate, missionZuluDate } from '../utils/time';
import { formatAltitude, formatDistance, formatPressure, formatSpeed, formatTemperature } from '../utils/units';
import { waypointAnnotationKey } from '../utils/waypointAnnotations';
import type { ExportFlight, ExportPlan } from './exportPlan';

/** Everything a page needs. `view` is already filtered for the displayed side and view mode (D1). */
export interface PagePlanInput {
  view: MissionData;
  settings: DisplaySettings;
  plan: ExportPlan;
  side: Side;
  /** Flights inside the export scope, from selectExportFlights(). */
  flights: ExportFlight[];
  whiteboard: WhiteboardData;
}

const SMEAC_FIELDS = ['situation', 'mission', 'execution', 'adminLogistics', 'commandSignal'] as const;
const MAP_FLIGHTS_PER_PAGE = 4;

/**
 * Plans the printed and exported pages (SPEC F9). Print, PNG and Markdown all read
 * this one list, so the same section shows the same data everywhere. Every label is
 * in the output language (`export:` namespace), not the UI language.
 */
export function planExportPages(input: PagePlanInput, t: KneeboardTranslate): KneeboardPage[] {
  const pages: KneeboardPage[] = [];
  for (const section of input.plan.sections) {
    switch (section) {
      case 'overview':
        pages.push(overviewPage(input, t));
        break;
      case 'weather':
        pages.push(weatherPage(input, t));
        break;
      case 'flights':
        pages.push(flightListPage(input, t));
        break;
      case 'route':
        pages.push(...routePages(input, t));
        break;
      case 'comms':
        pages.push(commsPage(input, t));
        break;
      case 'support':
        pages.push(supportPage(input, t));
        break;
      case 'threats': {
        // Threat data is creator-only (D1). Pilot view drops the section even when it is selected.
        const threats = threatsPage(input, t);
        if (threats) pages.push(threats);
        break;
      }
      case 'map':
        pages.push(...mapPages(input, t));
        break;
      case 'notes':
        pages.push(notesPage(input, t));
        pages.push({ kind: 'whiteboard', section: 'notes', title: t('export:label.whiteboard'), data: input.whiteboard });
        break;
    }
  }
  return pages;
}

function overviewPage(input: PagePlanInput, t: KneeboardTranslate): KneeboardPage {
  const { meta } = input.view;
  const local = missionLocalDate(meta);
  const zulu = missionZuluDate(meta);
  const lines = [
    meta.sortie || t('export:label.notAvailable'),
    `${t('export:label.theatre')}: ${meta.theatre}`,
    `${t('export:label.date')}: ${formatDateYMD(local)}`,
    `${t('export:label.startLocal')}: ${formatTimeHHMM(local)} (${formatUtcOffset(meta.utcOffset)})`,
    `${t('export:label.startZulu')}: ${formatTimeHHMM(zulu)}Z`,
    `${t('export:label.view')}: ${t(input.plan.viewMode === 'pilot' ? 'export:label.viewPilot' : 'export:label.viewCreator')}`,
  ];
  const description = input.view.meta.description.trim();
  if (description) lines.push(...description.split(/\r?\n/));
  const sections: KneeboardSection[] = [{ heading: t('export:label.mission'), lines }];
  // SPEC 1.3: the task text of the displayed side, or the neutral text when that side has none.
  // The opposing side's text is already cleared by applyViewMode (D1).
  const ownTask = input.side === 'blue' ? meta.descriptionBlueTask : meta.descriptionRedTask;
  const task = ownTask.trim() || meta.descriptionNeutralTask.trim();
  if (task) sections.push({ heading: t('export:label.task'), lines: task.split(/\r?\n/) });
  // Warnings of the displayed view. applyViewMode already removed the other side's issues (D1), and
  // the texts are in the output language, the same as the rest of the page.
  const warnings = [...new Set(input.view.issues.map(issue => t(`issues:${issue.code}`, { ...issue.params })))];
  if (warnings.length > 0) sections.push({ heading: t('export:label.warnings'), lines: warnings });
  return textPage('overview', t('export:sections.overview'), sections);
}

function weatherPage(input: PagePlanInput, t: KneeboardTranslate): KneeboardPage {
  const { weather, meta } = input.view;
  const { settings } = input;
  const zulu = missionZuluDate(meta);
  const lines = [
    `${t('export:label.temperature')}: ${formatTemperature(weather.temperature, settings.temperatureUnit)}`,
    `${t('export:label.qnh')}: ${formatPressure(weather.qnh, settings.pressureUnit)}`,
    `${t('export:label.visibility')}: ${formatDistance(weather.visibility, settings.distanceUnit)}`,
    `${t('export:label.clouds')}: ${weather.clouds.label} (${t('export:label.cloudBase', { value: formatAltitude(weather.clouds.base, settings.altitudeUnit) })})`,
  ];
  for (const wind of weather.wind) {
    const level = wind.level === 'ground' ? t('export:label.ground') : `${wind.level} m`;
    const to = (wind.from + 180) % 360;
    const direction = windText(wind.from, to, settings.windDisplay, t);
    lines.push(`${t('export:label.wind')} ${level}: ${direction} / ${formatSpeed(wind.speed, settings.speedUnit)}`);
  }
  lines.push(`${t('export:label.metar')}: ${buildMetar(weather, { time: zulu })}`);
  return textPage('weather', t('export:sections.weather'), [{ heading: t('export:sections.weather'), lines }]);
}

function windText(from: number, to: number, display: DisplaySettings['windDisplay'], t: KneeboardTranslate): string {
  const fromDeg = Math.round(from);
  const toDeg = Math.round(to);
  if (display === 'from') return t('export:label.windFrom', { deg: fromDeg });
  if (display === 'to') return t('export:label.windTo', { deg: toDeg });
  return t('export:label.windBoth', { from: fromDeg, to: toDeg });
}

function flightListPage(input: PagePlanInput, t: KneeboardTranslate): KneeboardPage {
  if (input.flights.length === 0) {
    return textPage('flights', t('export:sections.flights'), [{ heading: t('export:sections.flights'), lines: [t('export:label.noFlights')] }]);
  }
  const sections = input.flights.map(({ flight, key }) => {
    const notes = input.view.userNotes.perFlight[key];
    const lines = [
      `${t('export:label.task')}: ${flight.task}`,
      `${t('export:label.frequency')}: ${frequencyMHz(flight.frequency)} MHz`,
    ];
    if (notes?.pilotName) lines.push(`${t('export:label.pilotName')}: ${notes.pilotName}`);
    if (notes?.tot) lines.push(`${t('export:label.tot')}: ${notes.tot}`);
    if (notes?.jokerFuel !== null && notes?.jokerFuel !== undefined) lines.push(`${t('export:label.joker')}: ${notes.jokerFuel} ${t('export:label.fuelUnit')}`);
    if (notes?.bingoFuel !== null && notes?.bingoFuel !== undefined) lines.push(`${t('export:label.bingo')}: ${notes.bingoFuel} ${t('export:label.fuelUnit')}`);
    if (notes?.customNotes) lines.push(`${t('export:label.customNotes')}: ${notes.customNotes}`);
    return { heading: `${flight.callsign || flight.name} · ${flight.type} ×${flight.units.length}`, lines };
  });
  return textPage('flights', t('export:sections.flights'), sections);
}

/** One nav log page per flight (SPEC F3). The table has the eight default columns. */
function routePages(input: PagePlanInput, t: KneeboardTranslate): KneeboardPage[] {
  if (input.flights.length === 0) {
    return [textPage('route', t('export:sections.route'), [{ heading: t('export:sections.route'), lines: [t('export:label.noWaypoints')] }])];
  }
  return input.flights.flatMap(({ flight, side }) => {
    // Every route point gets a row; the renderer paginates long tables (SPEC F3: rows = route points).
    const rows = flight.route.map(point => routeRow(point, flight, input, t));
    if (rows.length === 0) {
      // A flight without route points has no table to draw: say so instead of an empty table.
      return [textPage('route', `${t('export:sections.route')}: ${flight.callsign || flight.name}`, [
        { heading: `${flight.callsign || flight.name} · ${flight.type}`, lines: [t('export:label.noWaypoints')] },
      ])];
    }
    const header = [
      t('export:label.navNo'),
      t('export:label.name'),
      t('export:label.coordinate'),
      t('export:label.altitude'),
      t('export:label.speed'),
      t('export:label.eta'),
      t('export:label.legDistance'),
      t('export:label.bearing'),
    ];
    const annotations = flight.route.flatMap((point, routeIndex) => {
      const note = input.view.userNotes.waypoints[waypointAnnotationKey(side, flight.groupId, routeIndex)];
      if (!note || (!note.purpose && !note.notes)) return [];
      return [`${point.index}. ${[note.purpose, note.notes].filter(Boolean).join(' / ')}`];
    });
    const sections: KneeboardSection[] = [
      {
        heading: `${flight.callsign || flight.name} · ${flight.type}`,
        lines: rows.map(row => row.join(' | ')),
        table: { header, rows },
      },
    ];
    if (annotations.length > 0) sections.push({ heading: t('export:label.notesLabel'), lines: annotations });
    return [textPage('route', `${t('export:sections.route')}: ${flight.callsign || flight.name}`, sections)];
  });
}

function routeRow(point: RoutePoint, flight: Flight, input: PagePlanInput, t: KneeboardTranslate): string[] {
  const { settings, view } = input;
  const eta = settings.timeDisplay === 'local'
    ? formatEtaLocal(view.meta, point.eta)
    : settings.timeDisplay === 'zulu'
      ? `${formatEtaZulu(view.meta, point.eta)}Z`
      : `${formatEtaLocal(view.meta, point.eta)} / ${formatEtaZulu(view.meta, point.eta)}Z`;
  const altitude = `${formatAltitude(point.alt, settings.altitudeUnit)} ${point.altType === 'RADIO' ? 'AGL' : 'MSL'}`;
  const leg = point.leg;
  const bearing = leg
    ? leg.magneticBearing === undefined
      ? `${leg.trueBearing.toFixed(0)}°T (${t('export:label.trueOnly')})`
      : `${leg.trueBearing.toFixed(0)}°T / ${leg.magneticBearing.toFixed(0)}°M`
    : '-';
  return [
    String(point.index),
    point.name || point.action || '-',
    coordinateText(point.latlon, point.latlonResolved, point.xy, flight.type, settings, t),
    altitude,
    formatSpeed(point.speed, settings.speedUnit),
    eta,
    leg ? formatDistance(leg.distance, settings.distanceUnit) : '-',
    bearing,
  ];
}

function coordinateText(
  latlon: [number, number] | undefined,
  resolved: boolean | undefined,
  xy: [number, number],
  aircraftType: string | null,
  settings: DisplaySettings,
  t: KneeboardTranslate,
): string {
  if (resolved === false || !latlon) {
    return t('export:label.unresolved', { x: xy[0].toFixed(0), y: xy[1].toFixed(0) });
  }
  return formatCoordinate(latlon[0], latlon[1], resolveCoordinateFormat(settings.coordinateFormat, aircraftType));
}

function commsPage(input: PagePlanInput, t: KneeboardTranslate): KneeboardPage {
  const sections: KneeboardSection[] = input.flights.map(({ flight }) => {
    const radios = flight.units[0]?.radios ?? [];
    return {
      heading: `${flight.callsign || flight.name} · ${flight.type}`,
      lines: radios.length > 0
        ? radios.map(radio => `${t('export:label.channel')} ${radio.channel}: ${radio.frequency.toFixed(3)} MHz ${radio.modulation === 0 ? 'AM' : 'FM'} ${radio.name}`)
        : [t('export:label.noRadios')],
    };
  });
  const support = supportAssets(input.view).filter(asset => asset.frequency > 0);
  sections.push({
    heading: t('export:sections.support'),
    lines: support.length > 0
      ? support.map(asset => `${asset.kind.toUpperCase()} ${asset.callsign}: ${frequencyMHz(asset.frequency)} MHz${asset.tacan ? ` · ${t('export:label.tacan')} ${asset.tacan.channel}` : ''}`)
      : [t('export:label.noSupport')],
  });
  sections.push({ heading: t('export:label.guard'), lines: [t('export:label.guardUhf'), t('export:label.guardVhf')] });
  return textPage('comms', t('export:sections.comms'), sections);
}

function supportPage(input: PagePlanInput, t: KneeboardTranslate): KneeboardPage {
  const assets = supportAssets(input.view);
  const { settings } = input;
  const sections: KneeboardSection[] = assets.map(asset => ({
    heading: `${asset.kind.toUpperCase()} · ${asset.callsign}`,
    lines: [
      asset.frequency > 0 ? `${t('export:label.frequency')}: ${frequencyMHz(asset.frequency)} MHz` : '',
      asset.tacan ? `${t('export:label.tacan')}: ${asset.tacan.channel} ${asset.tacan.mode}` : '',
      `${t('export:label.position')}: ${coordinateText(asset.latlon, asset.latlonResolved, asset.position, null, settings, t)}`,
      asset.orbit ? `${t('export:label.altitude')}: ${formatAltitude(asset.orbit.altitude, settings.altitudeUnit)} · ${t('export:label.speed')}: ${formatSpeed(asset.orbit.speed, settings.speedUnit)}` : '',
    ].filter(Boolean),
  }));
  if (sections.length === 0) sections.push({ heading: t('export:sections.support'), lines: [t('export:label.noSupport')] });
  return textPage('support', t('export:sections.support'), sections);
}

/**
 * Threat ranges for the opposing side (creator view only, D1). An unknown range is
 * written as "未収録", never as "なし".
 */
function threatsPage(input: PagePlanInput, t: KneeboardTranslate): KneeboardPage | null {
  if (input.plan.viewMode !== 'creator') return null;
  const opposing: Side = input.side === 'blue' ? 'red' : 'blue';
  const groups = input.view.coalitions[opposing].aiGroups;
  const { settings } = input;
  const range = (value: number | undefined, unknown: boolean): string => {
    if (Number.isFinite(value) && (value ?? 0) > 0) return formatDistance(value!, settings.distanceUnit);
    return unknown ? t('export:label.unrecorded') : t('export:label.none');
  };
  const sections: KneeboardSection[] = groups.map(group => {
    const unknown = group.threatRangeSource === 'unknown';
    return {
      heading: `${group.type} ×${group.count}`,
      lines: [
        `${t('export:label.engagement')}: ${range(group.threatRange, unknown)}`,
        `${t('export:label.detection')}: ${range(group.detectionRange, unknown)}`,
      ],
    };
  });
  if (sections.length === 0) sections.push({ heading: t('export:sections.threats'), lines: [t('export:label.noThreats')] });
  return textPage('threats', t('export:sections.threats'), sections);
}

function mapPages(input: PagePlanInput, t: KneeboardTranslate): KneeboardPage[] {
  const { view } = input;
  if (!PROJECTIONS[view.meta.theatre]) {
    return [textPage('map', t('export:sections.map'), [{
      heading: t('export:sections.map'),
      lines: [t('export:label.mapUnsupported', { theatre: view.meta.theatre })],
    }])];
  }
  const flights = input.flights.map(item => item.flight);
  const pageCount = Math.max(1, Math.ceil(flights.length / MAP_FLIGHTS_PER_PAGE));
  const pages: KneeboardPage[] = [];
  for (let index = 0; index < pageCount; index += 1) {
    const title = pageCount > 1 ? `${t('export:sections.map')} ${index + 1}/${pageCount}` : t('export:sections.map');
    pages.push({
      kind: 'map',
      section: 'map',
      title,
      scene: buildMissionMapScene(
        view,
        flights.slice(index * MAP_FLIGHTS_PER_PAGE, (index + 1) * MAP_FLIGHTS_PER_PAGE),
        input.side === 'blue' ? 'red' : 'blue',
      ),
    });
  }
  return pages;
}

function notesPage(input: PagePlanInput, t: KneeboardTranslate): KneeboardPage {
  const sections: KneeboardSection[] = [];
  const smeac = input.view.userNotes.smeac;
  for (const field of SMEAC_FIELDS) {
    const content = smeac[field].trim();
    if (content) sections.push({ heading: t(`export:label.smeac.${field}`), lines: content.split(/\r?\n/) });
  }
  for (const item of input.flights) {
    const perFlight = input.view.userNotes.perFlight[item.key];
    if (!perFlight) continue;
    const lines = [
      perFlight.pilotName && `${t('export:label.pilotName')}: ${perFlight.pilotName}`,
      perFlight.tot && `${t('export:label.tot')}: ${perFlight.tot}`,
      perFlight.jokerFuel !== null && `${t('export:label.joker')}: ${perFlight.jokerFuel}`,
      perFlight.bingoFuel !== null && `${t('export:label.bingo')}: ${perFlight.bingoFuel}`,
      perFlight.customNotes,
    ].filter((line): line is string => Boolean(line));
    if (lines.length > 0) sections.push({ heading: item.flight.callsign || item.flight.name, lines });
  }
  if (sections.length === 0) sections.push({ heading: t('export:sections.notes'), lines: [t('export:label.noNotes')] });
  return textPage('notes', t('export:sections.notes'), sections);
}

function supportAssets(view: MissionData): SupportAsset[] {
  const seen = new Set<string>();
  return [
    ...view.coalitions.blue.support,
    ...view.coalitions.red.support,
    ...view.coalitions.neutral.support,
  ].filter(asset => {
    if (asset.hidden) return false;
    const key = `${asset.kind}:${asset.callsign}:${asset.position.join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function frequencyMHz(hertz: number): string {
  return (hertz / 1_000_000).toFixed(3);
}

function textPage(section: BriefingSection, title: string, sections: KneeboardSection[]): KneeboardPage {
  return { kind: 'text', section, title, sections };
}
