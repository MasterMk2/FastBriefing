import { handoutWarningIssues } from '../core/issues';
import type { DisplaySettings, Flight, MissionData, MissionMeta, Pylon, RoutePoint, Side, SupportAsset, Unit } from '../types/mission';
import type { BriefingSection } from '../utils/briefingSections';
import type { WhiteboardData } from '../types/whiteboard';
import type { KneeboardMapPin, KneeboardPage, KneeboardSection, KneeboardTranslate } from '../utils/kneeboard';
import { classifyAircraftProps, sortPylonsByStation } from '../utils/aircraftProps';
import { getMoonInfo, getSunTimes } from '../utils/astro';
import { buildMetar } from '../utils/metar';
import { PROJECTIONS, formatCoordinate, resolveCoordinateFormat } from '../utils/coordinates';
import { buildMissionMapScene } from '../utils/missionMapRaster';
import { formatDateYMD, formatEtaLocal, formatEtaZulu, formatTimeHHMM, formatUtcOffset, hasEta, missionLocalDate, missionZuluDate } from '../utils/time';
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
  const { timeDisplay } = input.settings;
  const local = missionLocalDate(meta);
  const zulu = missionZuluDate(meta);
  const lines = [
    meta.sortie || t('export:label.notAvailable'),
    `${t('export:label.theatre')}: ${meta.theatre}`,
    `${t('export:label.date')}: ${dateText(local, zulu, timeDisplay)}`,
    // The start time follows the time display setting (D6), as the route table does.
    ...(timeDisplay !== 'zulu' ? [`${t('export:label.startLocal')}: ${formatTimeHHMM(local)} (${formatUtcOffset(meta.utcOffset)})`] : []),
    ...(timeDisplay !== 'local' ? [`${t('export:label.startZulu')}: ${formatTimeHHMM(zulu)}Z`] : []),
    `${t('export:label.view')}: ${t(input.plan.viewMode === 'pilot' ? 'export:label.viewPilot' : 'export:label.viewCreator')}`,
  ];
  const sections: KneeboardSection[] = [{ heading: t('export:label.mission'), lines }];
  // The description is the author's free text (often columns lined up with spaces and ==== rules): its own
  // section, kept as written, so a list or a proportional font does not break it.
  const description = freeTextLines(meta.description);
  if (description.length > 0) sections.push({ heading: t('export:label.description'), lines: description, preformatted: true });
  // SPEC 1.3: the task text of the displayed side, or the neutral text when that side has none.
  // The opposing side's text is already cleared by applyViewMode (D1).
  const ownTask = freeTextLines(input.side === 'blue' ? meta.descriptionBlueTask : meta.descriptionRedTask);
  const task = ownTask.length > 0 ? ownTask : freeTextLines(meta.descriptionNeutralTask);
  if (task.length > 0) sections.push({ heading: t('export:label.task'), lines: task, preformatted: true });
  sections.push(astroSection(input, t));
  // Warnings of the displayed view. applyViewMode already removed the other side's issues and the issues of
  // hidden groups (D1). The pilot handout lists what the pilot overview lists as load notices (handoutWarningIssues),
  // so data-quality notes and creator-only codes stay off it. The texts are in the output language.
  const warnings = [...new Set(handoutWarningIssues(input.view.issues, input.plan.viewMode)
    .map(issue => t(`issues:${issue.code}`, { ...issue.params })))];
  if (warnings.length > 0) sections.push({ heading: t('export:label.warnings'), lines: warnings });
  return textPage('overview', t('export:sections.overview'), sections);
}

/** The date follows the time display setting, like the start times next to it (D6). */
function dateText(local: Date, zulu: Date, timeDisplay: DisplaySettings['timeDisplay']): string {
  const localText = formatDateYMD(local);
  const zuluText = formatDateYMD(zulu);
  if (timeDisplay === 'local') return localText;
  if (timeDisplay === 'zulu') return `${zuluText}Z`;
  return localText === zuluText ? localText : `${localText} / ${zuluText}Z`;
}

/** Mission time `elapsedSeconds` after the start, in the time display setting (D6). */
function missionTimeText(meta: MissionMeta, elapsedSeconds: number, timeDisplay: DisplaySettings['timeDisplay']): string {
  if (timeDisplay === 'local') return formatEtaLocal(meta, elapsedSeconds);
  if (timeDisplay === 'zulu') return `${formatEtaZulu(meta, elapsedSeconds)}Z`;
  return `${formatEtaLocal(meta, elapsedSeconds)} / ${formatEtaZulu(meta, elapsedSeconds)}Z`;
}

/**
 * The output side's bullseye and the sun and moon at it, as on the overview screen. The opposing bullseye
 * is never resolved in pilot view (D1), and without a resolved bullseye there is no place to compute for.
 */
function astroSection(input: PagePlanInput, t: KneeboardTranslate): KneeboardSection {
  const { meta } = input.view;
  const { settings } = input;
  const bullseye = input.view.coalitions[input.side].bullseye;
  const resolved = bullseye.latlonResolved !== false && Array.isArray(bullseye.latlon)
    && !(bullseye.latlon[0] === 0 && bullseye.latlon[1] === 0);
  const na = t('export:label.notAvailable');
  const lines = [`${t('export:label.bullseye')}: ${coordinateText(bullseye.latlon, resolved, bullseye.xy, null, settings, t)}`];
  if (resolved) {
    const zulu = missionZuluDate(meta);
    const sun = getSunTimes(zulu, bullseye.latlon[0], bullseye.latlon[1]);
    const moon = getMoonInfo(zulu, bullseye.latlon[0], bullseye.latlon[1]);
    const at = (date: Date | null | undefined) => (date
      ? missionTimeText(meta, (date.getTime() - zulu.getTime()) / 1000, settings.timeDisplay)
      : na);
    const range = (from: Date | null | undefined, to: Date | null | undefined) => (from && to
      ? t('export:label.timeRange', { from: at(from), to: at(to) })
      : na);
    lines.push(
      `${t('export:label.sunrise')}: ${at(sun.sunrise)}`,
      `${t('export:label.sunset')}: ${at(sun.sunset)}`,
      `${t('export:label.civilTwilight')}: ${range(sun.dawn, sun.dusk)}`,
      `${t('export:label.nauticalTwilight')}: ${range(sun.nauticalDawn, sun.nauticalDusk)}`,
      `${t('export:label.moonAge')}: ${t('export:label.moonAgeValue', { days: moon.ageDays.toFixed(1) })}`,
    );
  }
  return { heading: t('export:label.astro'), lines };
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
  // Fog, dust and ground turbulence, as the overview screen and the oral briefing show them.
  if (weather.fog.enabled) {
    lines.push(`${t('export:label.fog')}: ${t('export:label.fogDetails', {
      thickness: formatAltitude(weather.fog.thickness, settings.altitudeUnit),
      visibility: formatDistance(weather.fog.visibility, settings.distanceUnit),
    })}`);
  }
  if (weather.dust.enabled) {
    lines.push(`${t('export:label.dust')}: ${t('export:label.dustDensity', { value: weather.dust.density })}`);
  }
  const ground = weather.turbulence.ground;
  const groundText = !Number.isFinite(ground)
    ? t('export:label.notAvailable')
    : ground === 0 ? t('export:label.none') : t('export:label.groundTurbulenceValue', { value: ground.toFixed(1) });
  lines.push(`${t('export:label.groundTurbulence')}: ${groundText}`);
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
  const sections = input.flights.flatMap(({ flight, key }) => {
    const notes = input.view.userNotes.perFlight[key];
    const lines = [
      `${t('export:label.task')}: ${flight.task}`,
      `${t('export:label.frequency')}: ${frequencyMHz(flight.frequency)} MHz`,
    ];
    if (notes?.pilotName) lines.push(`${t('export:label.pilotName')}: ${notes.pilotName}`);
    if (notes?.tot) lines.push(`${t('export:label.tot')}: ${notes.tot}`);
    if (notes?.jokerFuel !== null && notes?.jokerFuel !== undefined) lines.push(`${t('export:label.joker')}: ${notes.jokerFuel} ${t('export:label.fuelUnit')}`);
    if (notes?.bingoFuel !== null && notes?.bingoFuel !== undefined) lines.push(`${t('export:label.bingo')}: ${notes.bingoFuel} ${t('export:label.fuelUnit')}`);
    const name = flight.callsign || flight.name;
    return [
      { heading: `${name} · ${flight.type} ×${flight.units.length}`, lines },
      memoSection(notes?.customNotes ?? '', `${t('export:label.customNotes')}: ${name}`),
      rosterSection(flight, name, t),
      loadoutSection(flight.units[0], name, t),
      aircraftSettingsSection(flight.units[0], name, t),
    ].filter((section): section is KneeboardSection => section !== null);
  });
  return textPage('flights', t('export:sections.flights'), sections);
}

/** Every aircraft of the flight: name, tail number, skill, livery, fuel and countermeasures. */
function rosterSection(flight: Flight, name: string, t: KneeboardTranslate): KneeboardSection | null {
  if (flight.units.length === 0) return null;
  const na = t('export:label.notAvailable');
  const header = [
    t('export:label.unitName'),
    t('export:label.tailNumber'),
    t('export:label.skill'),
    t('export:label.livery'),
    t('export:label.fuelKg'),
    t('export:label.countermeasures'),
  ];
  const rows = flight.units.map(unit => [
    unit.name || na,
    unit.tailNumber || na,
    unit.skill || na,
    unit.livery || na,
    String(unit.payload?.fuel ?? 0),
    `${unit.payload?.chaff ?? 0} / ${unit.payload?.flare ?? 0}`,
  ]);
  return { heading: `${t('export:label.roster')}: ${name}`, lines: labeledRows(header, rows), table: { header, rows } };
}

/** The lead aircraft's payload in station order (the lineup card's table). */
function loadoutSection(unit: Unit | undefined, name: string, t: KneeboardTranslate): KneeboardSection | null {
  if (!unit) return null;
  const pylons = sortPylonsByStation(unit.payload?.pylons ?? []);
  const heading = `${t('export:label.loadout')}: ${name}`;
  if (pylons.length === 0) return { heading, lines: [t('export:label.noLoadout')] };
  const header = [t('export:label.station'), t('export:label.weapon'), t('export:label.count')];
  const rows = pylons.map(pylon => [pylon.station, weaponName(pylon, t), String(pylon.count)]);
  return { heading, lines: rows.map(([station, weapon, count]) => `${station}: ${weapon} ×${count}`), table: { header, rows } };
}

/** A weapon name; one that is not in the reference data gets the "not recorded" mark in the output language. */
export function weaponName(pylon: Pylon, t: KneeboardTranslate): string {
  return pylon.unknown ? t('export:label.unknownWeapon', { name: pylon.name }) : pylon.name;
}

/** The lead aircraft's known settings (laser codes, IFF, ...) and Link16, as the lineup card shows them. */
function aircraftSettingsSection(unit: Unit | undefined, name: string, t: KneeboardTranslate): KneeboardSection | null {
  if (!unit) return null;
  const yesNo = (value: boolean) => t(value ? 'export:label.yes' : 'export:label.no');
  const settings = classifyAircraftProps(unit.props);
  const lines = settings.known.map(entry => `${t(entry.labelKey)}: ${entry.value.kind === 'bool' ? yesNo(entry.value.value) : entry.value.text}`);
  const link16 = unit.datalink?.link16;
  lines.push(`${t('export:label.link16')}: ${link16
    ? t('export:label.link16Value', { lead: yesNo(link16.flightLead), team: link16.team })
    : t('export:label.link16None')}`);
  return { heading: `${t('export:label.aircraftSettings')}: ${name}`, lines };
}

/**
 * Table rows written as labelled lines for the PNG kneeboard, which draws `lines` only: the first cell starts the
 * row, and each other cell is "label: value". A long row then wraps between cells, and every page keeps its labels.
 */
function labeledRows(header: readonly string[], rows: readonly string[][]): string[] {
  return rows.flatMap(row => [
    row[0] ?? '',
    ...row.slice(1).map((cell, index) => `  ${header[index + 1]}: ${cell}`),
  ]);
}

/** One nav log page per flight (SPEC F3). The table has the eight default columns. */
function routePages(input: PagePlanInput, t: KneeboardTranslate): KneeboardPage[] {
  if (input.flights.length === 0) {
    return [textPage('route', t('export:sections.route'), [{ heading: t('export:sections.route'), lines: [t('export:label.noWaypoints')] }])];
  }
  return input.flights.flatMap(({ flight, side }) => {
    // Every route point gets a row; the renderer paginates long tables (SPEC F3: rows = route points).
    const rows = flight.route.map((point, routeIndex) => routeRow(point, routeIndex, flight, input, t));
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
        // The PNG kneeboard draws the lines, not the table, so each point is written with its labels.
        lines: routeLines(header, rows),
        table: { header, rows },
      },
    ];
    if (annotations.length > 0) sections.push({ heading: t('export:label.notesLabel'), lines: annotations });
    return [textPage('route', `${t('export:sections.route')}: ${flight.callsign || flight.name}`, sections)];
  });
}

/** Nav log rows as labelled lines: "No. name", then the coordinate, altitude and speed, ETA, and leg. */
function routeLines(header: readonly string[], rows: readonly string[][]): string[] {
  return rows.flatMap(([no, name, coordinate, altitude, speed, eta, leg, bearing]) => [
    `${no}. ${name}`,
    `  ${header[2]}: ${coordinate}`,
    `  ${header[3]}: ${altitude} · ${header[4]}: ${speed}`,
    `  ${header[5]}: ${eta}`,
    `  ${header[6]}: ${leg} · ${header[7]}: ${bearing}`,
  ]);
}

function routeRow(point: RoutePoint, routeIndex: number, flight: Flight, input: PagePlanInput, t: KneeboardTranslate): string[] {
  const { settings, view } = input;
  // A later point without an ETA is written as not set, not as the mission start (the first point keeps its 0).
  const eta = hasEta(point, routeIndex) ? missionTimeText(view.meta, point.eta, settings.timeDisplay) : '-';
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

/**
 * The map pins of the user (label and memo). Annotations belong to the mission, not to a side, and have no
 * hidden flag, so the pilot view lists the same pins the map canvas already draws there (D1 has nothing to drop).
 * Lines (strokes) are not listed: they have no text.
 */
function mapPins(view: MissionData, t: KneeboardTranslate): KneeboardMapPin[] {
  return view.userNotes.mapAnnotations.flatMap(annotation => (annotation.kind === 'pin'
    ? [{ label: annotation.label.trim() || t('export:label.mapPin'), notes: annotation.notes.trim() }]
    : []));
}

function mapPages(input: PagePlanInput, t: KneeboardTranslate): KneeboardPage[] {
  const { view } = input;
  const pins = mapPins(view, t);
  if (!PROJECTIONS[view.meta.theatre]) {
    // No map can be drawn, but the pins are still text the pilot needs.
    const sections: KneeboardSection[] = [{
      heading: t('export:sections.map'),
      lines: [t('export:label.mapUnsupported', { theatre: view.meta.theatre })],
    }];
    if (pins.length > 0) sections.push({ heading: t('export:label.mapPins'), lines: pins.map(pinLine) });
    return [textPage('map', t('export:sections.map'), sections)];
  }
  const flights = input.flights.map(item => item.flight);
  const pageCount = Math.max(1, Math.ceil(flights.length / MAP_FLIGHTS_PER_PAGE));
  const pages: KneeboardPage[] = [];
  for (let index = 0; index < pageCount; index += 1) {
    const title = pageCount > 1 ? `${t('export:sections.map')} ${index + 1}/${pageCount}` : t('export:sections.map');
    const scene = buildMissionMapScene(
      view,
      flights.slice(index * MAP_FLIGHTS_PER_PAGE, (index + 1) * MAP_FLIGHTS_PER_PAGE),
      input.side === 'blue' ? 'red' : 'blue',
    );
    // The display setting "mapBackground" applies to the print, the PNG and the .miz alike (decision 6).
    // The pin list is mission-wide, so only the first map page carries it (a long mission does not repeat it).
    pages.push({
      kind: 'map',
      section: 'map',
      title,
      scene: { ...scene, basemap: input.settings.mapBackground },
      pins: index === 0 ? pins : [],
    });
  }
  return pages;
}

/** "label: memo", or the label alone when the pin has no memo. */
export function pinLine(pin: KneeboardMapPin): string {
  return pin.notes ? `${pin.label}: ${pin.notes.replace(/\s*\r?\n\s*/g, ' / ')}` : pin.label;
}

function notesPage(input: PagePlanInput, t: KneeboardTranslate): KneeboardPage {
  const sections: KneeboardSection[] = [];
  const smeac = input.view.userNotes.smeac;
  for (const field of SMEAC_FIELDS) {
    const section = memoSection(smeac[field], t(`export:label.smeac.${field}`));
    if (section) sections.push(section);
  }
  for (const item of input.flights) {
    const perFlight = input.view.userNotes.perFlight[item.key];
    if (!perFlight) continue;
    const name = item.flight.callsign || item.flight.name;
    const lines = [
      perFlight.pilotName && `${t('export:label.pilotName')}: ${perFlight.pilotName}`,
      perFlight.tot && `${t('export:label.tot')}: ${perFlight.tot}`,
      perFlight.jokerFuel !== null && `${t('export:label.joker')}: ${perFlight.jokerFuel}`,
      perFlight.bingoFuel !== null && `${t('export:label.bingo')}: ${perFlight.bingoFuel}`,
    ].filter((line): line is string => Boolean(line));
    if (lines.length > 0) sections.push({ heading: name, lines });
    // The memo is free text: a section of its own, kept as written. Alone it takes the flight's name.
    const memo = memoSection(perFlight.customNotes, lines.length > 0 ? `${t('export:label.customNotes')}: ${name}` : name);
    if (memo) sections.push(memo);
  }
  if (sections.length === 0) sections.push({ heading: t('export:sections.notes'), lines: [t('export:label.noNotes')] });
  return textPage('notes', t('export:sections.notes'), sections);
}

/**
 * Free text as its lines, kept as written: blank lines inside and the leading spaces that line up columns stay.
 * Only the blank lines before and after the text and the spaces at line ends are dropped (`trim()` would take
 * the first line's indentation too).
 */
export function freeTextLines(value: string): string[] {
  const lines = value.split(/\r?\n/).map(line => line.trimEnd());
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start] === '') start += 1;
  while (end > start && lines[end - 1] === '') end -= 1;
  return lines.slice(start, end);
}

/** A free-text section (a memo, a SMEAC field), or null when the text is empty. */
function memoSection(value: string, heading: string): KneeboardSection | null {
  const lines = freeTextLines(value);
  return lines.length > 0 ? { heading, lines, preformatted: true } : null;
}

/** Blue and red support only: neutral support is not exported, the same as the support screen (decision 11). */
function supportAssets(view: MissionData): SupportAsset[] {
  const seen = new Set<string>();
  return [
    ...view.coalitions.blue.support,
    ...view.coalitions.red.support,
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
