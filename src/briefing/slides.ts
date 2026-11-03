import type { Flight, Side, MissionMeta, MissionData, SMEACNotes, SupportAsset, Weather, DisplaySettings } from '../types/mission';
import type { Units } from '../shell/units';
import { BRIEFING_SECTIONS, type BriefingSection } from '../utils/briefingSections';
import { parseFlightKey } from '../utils/flightKey';
import { calculateRouteLegs } from '../utils/routeLegs';
import { buildMetar } from '../utils/metar';
import { formatDateYMD, hasEta, missionLocalDate, missionZuluDate } from '../utils/time';

/** Upper bound of table rows on one slide (SPEC 1.3: 1 slide at most 14 rows). */
export const BRIEFING_ROWS_PER_SLIDE = 14;

const SIDES: readonly Side[] = ['blue', 'red'];

/** Shown in table cells that have no value. */
const DASH = '—';

/** Frequency comparison tolerance in MHz (1 kHz), as in the comms screen. */
const FREQUENCY_MATCH_TOLERANCE_MHZ = 0.001;

/** Translation function shape used by the builder (kept loose so tests can pass a plain function). */
export type Translate = (key: string, values?: Record<string, string | number>) => string;

/** A table cell is text, or an unresolved position (never drawn at [0, 0], SPEC 3). */
export type SlideCell = string | { unresolved: true; xy?: [number, number] };

export interface SlidePair {
  label: string;
  value: string;
}

export interface SlideTable {
  headers: string[];
  rows: SlideCell[][];
}

export interface BriefingSlide {
  key: string;
  section: BriefingSection;
  title: string;
  pairs?: SlidePair[];
  table?: SlideTable;
  text?: string;
  /**
   * The map slide. `flightKey` is the selected flight (contract 2.3, Lead decision 4): MapPanel shows that
   * flight, or every flight when it is null. The caption says which of the two the slide shows.
   */
  map?: { caption: string; flightKey: string | null };
}

export interface BriefingSlideInput {
  /** Displayed mission (`useMission().view`). The pilot view already has the opposing side removed. */
  view: MissionData;
  side: Side;
  viewMode: 'creator' | 'pilot';
  /** Section ids to include (settings, plus the start-screen toggles). */
  sections: ReadonlySet<string>;
  notes: SMEACNotes;
  units: Units;
  t: Translate;
  /** The selected flight (flightKey() value) for the map slide, or null for every flight. */
  focusFlightKey?: string | null;
  /** The time display setting. The mission date follows it: Zulu date when only Zulu is shown (D6). */
  timeDisplay?: DisplaySettings['timeDisplay'];
}

/**
 * True when a position can be drawn. `latlonResolved: false`, a missing value,
 * or [0, 0] (the normalizer's placeholder) are all unresolved.
 */
export function isResolvedLatLon(latlon: readonly number[] | null | undefined, resolved?: boolean): boolean {
  if (resolved === false || !latlon || latlon.length < 2) return false;
  const [lat, lon] = latlon;
  return Number.isFinite(lat)
    && Number.isFinite(lon)
    && Math.abs(lat) <= 90
    && Math.abs(lon) <= 180
    && !(lat === 0 && lon === 0);
}

/**
 * The task text for the displayed side: its own text, else the neutral text (SPEC 1.3).
 * Other default sentences are not shown.
 */
export function taskTextFor(meta: MissionMeta, side: Side): string {
  const own = side === 'blue' ? meta.descriptionBlueTask : meta.descriptionRedTask;
  return (own ?? '').trim() || (meta.descriptionNeutralTask ?? '').trim();
}

/** Frequencies are stored in MHz after normalization; a raw Hz value is converted (as CommsTab does). */
function toMHz(frequency: number): number {
  return Math.abs(frequency) >= 1000 ? frequency / 1000000 : frequency;
}

export function formatMHz(frequency: number): string {
  return `${toMHz(frequency).toFixed(3)} MHz`;
}

/**
 * Channel of a flight: the lead unit's radio preset on the flight frequency, written as in the
 * comms screen ("CH n" or "R n / CH n"). Without a matching preset it is a dash.
 */
function flightChannel(flight: Flight): string {
  if (!flight.frequency) return DASH;
  const frequency = toMHz(flight.frequency);
  const preset = (flight.units[0]?.radios ?? [])
    .find(radio => Math.abs(toMHz(radio.frequency) - frequency) <= FREQUENCY_MATCH_TOLERANCE_MHZ);
  if (!preset) return DASH;
  return preset.radio === undefined ? `CH${preset.channel}` : `R${preset.radio} / CH${preset.channel}`;
}

/** Channel of a support asset: its TACAN (channel and mode) or its ICLS channel. */
function supportChannel(asset: SupportAsset): string {
  if (asset.tacan) return `${asset.tacan.channel}${asset.tacan.mode}`;
  if (asset.icls) return `ICLS ${asset.icls.channel}`;
  return DASH;
}

/**
 * Fog, dust and ground turbulence rows. The old overview showed them; the overview screen and
 * the weather section both use this list, under their own namespace.
 */
export function weatherConditionPairs(
  weather: Weather,
  units: Units,
  t: Translate,
  namespace: 'overview' | 'briefing',
): SlidePair[] {
  const key = (name: string) => `${namespace}:weather.${name}`;
  const pairs: SlidePair[] = [];
  if (weather.fog.enabled) {
    pairs.push({
      label: t(key('fog')),
      value: t(key('fogDetails'), {
        thickness: units.alt(weather.fog.thickness),
        visibility: units.distance(weather.fog.visibility),
      }),
    });
  }
  if (weather.dust.enabled) {
    pairs.push({ label: t(key('dust')), value: t(key('dustDensity'), { value: weather.dust.density }) });
  }
  const ground = weather.turbulence.ground;
  let groundText: string;
  if (!Number.isFinite(ground)) groundText = t(`${namespace}:notAvailable`);
  else if (ground === 0) groundText = t(key('none'));
  else groundText = t(key('groundTurbulenceValue'), { value: ground.toFixed(1) });
  pairs.push({ label: t(key('groundTurbulence')), value: groundText });
  return pairs;
}

export function formatModulation(modulation: number): string {
  return modulation === 0 ? 'AM' : 'FM';
}

/**
 * Section builders, one per section id. The record is typed by BriefingSection, so adding a section id
 * without a builder is a compile error (the deck order is BRIEFING_SECTIONS, FR-93).
 */
const SECTION_BUILDERS: Record<BriefingSection, (input: BriefingSlideInput) => BriefingSlide[]> = {
  overview: input => [overviewSlide(input)],
  weather: input => [weatherSlide(input)],
  flights: input => flightSlides(input),
  route: input => routeSlides(input),
  comms: input => commsSlides(input),
  support: input => supportSlides(input),
  threats: input => threatSlides(input),
  map: input => [mapSlide(input)],
  notes: input => notesSlides(input),
};

export function buildBriefingSlides(input: BriefingSlideInput): BriefingSlide[] {
  const slides: BriefingSlide[] = [];
  for (const section of BRIEFING_SECTIONS) {
    if (!input.sections.has(section)) continue;
    // Threat data is creator-only (D1); the section is not built at all in pilot view.
    if (section === 'threats' && input.viewMode === 'pilot') continue;
    slides.push(...SECTION_BUILDERS[section](input));
  }
  return slides;
}

/** The sides shown in this view: both in creator view, the displayed side in pilot view (D1). */
function displayedSides(input: BriefingSlideInput): readonly Side[] {
  return input.viewMode === 'creator' ? SIDES : [input.side];
}

function naText(input: BriefingSlideInput): string {
  return input.t('briefing:notAvailable');
}

function sideLabel(input: BriefingSlideInput, side: Side): string {
  return input.t(`shell:side.${side}`);
}

function overviewSlide(input: BriefingSlideInput): BriefingSlide {
  const { meta } = input.view;
  const date = input.timeDisplay === 'zulu' ? missionZuluDate(meta) : missionLocalDate(meta);
  const pairs: SlidePair[] = [
    { label: input.t('briefing:overview.mission'), value: meta.sortie.trim() || naText(input) },
    { label: input.t('briefing:overview.theatre'), value: meta.theatre || naText(input) },
    { label: input.t('briefing:overview.date'), value: formatDateYMD(date) },
    { label: input.t('briefing:overview.start'), value: input.units.time(0) },
  ];
  for (const side of displayedSides(input)) {
    pairs.push({
      label: input.t('briefing:overview.flightCount', { side: sideLabel(input, side) }),
      value: String(input.view.coalitions[side].flights.length),
    });
  }
  const task = taskTextFor(meta, input.side);
  if (task) pairs.push({ label: input.t('briefing:overview.task'), value: task });
  return {
    key: 'overview',
    section: 'overview',
    title: input.t('briefing:section.overview'),
    pairs,
  };
}

function weatherSlide(input: BriefingSlideInput): BriefingSlide {
  const { weather, meta } = input.view;
  const { units, t } = input;
  const cloudLabel = weather.clouds.label.trim() || naText(input);
  return {
    key: 'weather',
    section: 'weather',
    title: t('briefing:section.weather'),
    pairs: [
      { label: t('briefing:weather.temperature'), value: units.temp(weather.temperature) },
      { label: t('briefing:weather.qnh'), value: units.pressure(weather.qnh) },
      { label: t('briefing:weather.visibility'), value: units.distance(weather.visibility) },
      {
        label: t('briefing:weather.clouds'),
        value: t('briefing:weather.cloudsValue', {
          label: cloudLabel,
          base: t('briefing:weather.cloudBase', { value: units.alt(weather.clouds.base) }),
        }),
      },
      ...weatherConditionPairs(weather, units, t, 'briefing'),
    ],
    table: {
      headers: [
        t('briefing:weather.windLevelHeader'),
        t('briefing:weather.windDirection'),
        t('briefing:weather.windSpeed'),
      ],
      rows: weather.wind.map(layer => [
        t(`briefing:weather.windLevel.${layer.level}`),
        units.wind(layer.to),
        units.speed(layer.speed),
      ]),
    },
    text: `${t('briefing:weather.metar')}: ${buildMetar(weather, { time: missionZuluDate(meta) })}`,
  };
}

function flightSlides(input: BriefingSlideInput): BriefingSlide[] {
  const rows: SlideCell[][] = [];
  for (const side of displayedSides(input)) {
    for (const flight of input.view.coalitions[side].flights) {
      const firstEta = flight.route.find(point => point.eta > 0);
      rows.push([
        sideLabel(input, side),
        flight.callsign || naText(input),
        flight.type || naText(input),
        String(flight.units.length),
        firstEta ? input.units.time(firstEta.eta) : naText(input),
      ]);
    }
  }
  return paged(input, 'flights', input.t('briefing:section.flights'), [
    input.t('briefing:flights.side'),
    input.t('briefing:flights.callsign'),
    input.t('briefing:flights.type'),
    input.t('briefing:flights.units'),
    input.t('briefing:flights.firstEta'),
  ], rows, input.t('briefing:empty.flights'));
}

function routeSlides(input: BriefingSlideInput): BriefingSlide[] {
  const { units, t } = input;
  const slides: BriefingSlide[] = [];
  for (const side of displayedSides(input)) {
    for (const flight of input.view.coalitions[side].flights) {
      if (flight.route.length === 0) continue;
      const legs = calculateRouteLegs(flight.route, input.view.meta);
      const rows: SlideCell[][] = legs.map((point, index) => {
        const resolved = isResolvedLatLon(point.latlon, point.latlonResolved);
        const previous = index > 0 ? legs[index - 1] : undefined;
        const previousResolved = previous ? isResolvedLatLon(previous.latlon, previous.latlonResolved) : true;
        const leg = point.leg;
        let magvar: SlideCell = naText(input);
        if (leg && (!resolved || !previousResolved)) {
          // The leg has no real position at one end, so its bearing is only a grid value: say so, do not print it.
          magvar = { unresolved: true };
        } else if (leg) {
          magvar = leg.magneticBearing === undefined
            ? `${t('briefing:route.trueOnly')} ${normalizeDegrees(leg.trueBearing)}°`
            : `${normalizeDegrees(leg.magneticBearing)}°`;
        }
        return [
          String(index + 1),
          point.name.trim() || naText(input),
          resolved ? units.coord(point.latlon, flight.type) : { unresolved: true, xy: point.xy },
          `${units.alt(point.alt)} ${t(`briefing:alt.${point.altType}`)}`,
          units.speed(point.speed),
          hasEta(point, index) ? units.time(point.eta) : naText(input),
          leg ? units.distance(leg.distance) : naText(input),
          magvar,
        ];
      });
      slides.push(...paged(input, 'route', t('briefing:route.title', { callsign: flight.callsign }), [
        t('briefing:route.col.no'),
        t('briefing:route.col.name'),
        t('briefing:route.col.coord'),
        t('briefing:route.col.alt'),
        t('briefing:route.col.speed'),
        t('briefing:route.col.eta'),
        t('briefing:route.col.leg'),
        t('briefing:route.col.magvar'),
      ], rows));
    }
  }
  return slides;
}

function commsSlides(input: BriefingSlideInput): BriefingSlide[] {
  const rows: SlideCell[][] = [];
  for (const side of displayedSides(input)) {
    const coalition = input.view.coalitions[side];
    for (const flight of coalition.flights) {
      rows.push([
        flight.callsign || naText(input),
        flightChannel(flight),
        flight.frequency ? formatMHz(flight.frequency) : naText(input),
        formatModulation(flight.modulation),
      ]);
    }
    for (const asset of coalition.support) {
      rows.push([
        asset.callsign || input.t(`briefing:support.kinds.${asset.kind}`),
        supportChannel(asset),
        asset.frequency ? formatMHz(asset.frequency) : naText(input),
        DASH,
      ]);
    }
  }
  return paged(input, 'comms', input.t('briefing:section.comms'), [
    input.t('briefing:comms.name'),
    input.t('briefing:comms.channel'),
    input.t('briefing:comms.frequency'),
    input.t('briefing:comms.modulation'),
  ], rows, input.t('briefing:empty.comms'));
}

function supportSlides(input: BriefingSlideInput): BriefingSlide[] {
  const rows: SlideCell[][] = [];
  for (const side of displayedSides(input)) {
    for (const asset of input.view.coalitions[side].support) {
      const resolved = isResolvedLatLon(asset.latlon, asset.latlonResolved);
      rows.push([
        input.t(`briefing:support.kinds.${asset.kind}`),
        asset.callsign || naText(input),
        asset.frequency ? formatMHz(asset.frequency) : naText(input),
        asset.tacan ? `${asset.tacan.channel}${asset.tacan.mode}` : naText(input),
        resolved && asset.latlon
          ? input.units.coord(asset.latlon, null)
          : { unresolved: true, xy: asset.position },
      ]);
    }
  }
  return paged(input, 'support', input.t('briefing:section.support'), [
    input.t('briefing:support.kind'),
    input.t('briefing:support.callsign'),
    input.t('briefing:support.frequency'),
    input.t('briefing:support.tacan'),
    input.t('briefing:support.position'),
  ], rows, input.t('briefing:empty.support'));
}

function threatSlides(input: BriefingSlideInput): BriefingSlide[] {
  if (input.viewMode === 'pilot') return [];
  const rows: SlideCell[][] = [];
  for (const side of SIDES) {
    for (const group of input.view.coalitions[side].aiGroups) {
      // Only a range recorded as a reference is shown as a number (F6). Anything else is "unrecorded".
      const range = group.threatRangeSource === 'reference' && group.threatRange !== undefined
        ? input.units.distance(group.threatRange)
        : input.t('briefing:threats.unrecorded');
      rows.push([sideLabel(input, side), group.type || naText(input), String(group.count), range]);
    }
  }
  return paged(input, 'threats', input.t('briefing:section.threats'), [
    input.t('briefing:threats.side'),
    input.t('briefing:threats.type'),
    input.t('briefing:threats.count'),
    input.t('briefing:threats.range'),
  ], rows, input.t('briefing:empty.threats'));
}

function mapSlide(input: BriefingSlideInput): BriefingSlide {
  const flightKey = input.focusFlightKey ?? null;
  const parsed = flightKey === null ? null : parseFlightKey(flightKey);
  const flight = parsed === null
    ? undefined
    : input.view.coalitions[parsed.side].flights.find(item => item.groupId === parsed.groupId);
  // The caption names the selected flight only when there is one in the view; otherwise every flight is shown.
  const caption = flight
    ? input.t('briefing:map.flight', { callsign: flight.callsign })
    : input.t('briefing:map.all');
  return {
    key: 'map',
    section: 'map',
    title: input.t('briefing:section.map'),
    map: { caption, flightKey: flight ? flightKey : null },
  };
}

const SMEAC_FIELDS = ['situation', 'mission', 'execution', 'adminLogistics', 'commandSignal'] as const;

function notesSlides(input: BriefingSlideInput): BriefingSlide[] {
  const slides: BriefingSlide[] = [];
  for (const field of SMEAC_FIELDS) {
    const text = (input.notes[field] ?? '').trim();
    if (!text) continue;
    slides.push({
      key: `notes-${field}`,
      section: 'notes',
      title: input.t(`briefing:smeac.${field}`),
      text,
    });
  }
  return slides;
}

/**
 * Splits the rows into slides of at most BRIEFING_ROWS_PER_SLIDE rows. With no rows,
 * one slide says why (the empty text) when there is one, otherwise no slide is made.
 */
function paged(
  input: BriefingSlideInput,
  section: BriefingSection,
  title: string,
  headers: string[],
  rows: SlideCell[][],
  emptyText?: string,
): BriefingSlide[] {
  if (rows.length === 0) {
    return emptyText ? [{ key: `${section}-${title}-empty`, section, title, text: emptyText }] : [];
  }
  const slides: BriefingSlide[] = [];
  for (let start = 0, page = 0; start < rows.length; start += BRIEFING_ROWS_PER_SLIDE, page += 1) {
    slides.push({
      key: `${section}-${title}-${page}`,
      section,
      title: page === 0 ? title : `${title}${input.t('briefing:continued')}`,
      table: { headers, rows: rows.slice(start, start + BRIEFING_ROWS_PER_SLIDE) },
    });
  }
  return slides;
}

function normalizeDegrees(value: number): number {
  return ((Math.round(value) % 360) + 360) % 360;
}
