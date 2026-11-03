import type { Coalition, DisplaySettings, Drawing, Flight, MissionData, MissionImagesBySide, MissionMeta, Side } from '../types/mission';

type ViewMode = DisplaySettings['viewMode'];

const OPPOSITE_OWNER: Record<Side, string> = { blue: 'RED', red: 'BLUE' };

/**
 * Coalition displayed when the user has not chosen one (D2): the side with more
 * flights that contain a Client or Player unit. A tie keeps blue.
 */
export function defaultSide(mission: MissionData): Side {
  const clientFlights = (side: Side) => mission.coalitions[side].flights.filter(hasClientUnit).length;
  return clientFlights('red') > clientFlights('blue') ? 'red' : 'blue';
}

/** The side to display: the user's explicit choice, or the D2 default when null/undefined. */
export function resolveSide(mission: MissionData, side?: Side | null): Side {
  return side ?? defaultSide(mission);
}

/**
 * Return the mission data visible in the requested view.
 *
 * Creator view returns the original object: the creator sees every coalition,
 * including hidden items, with the opposing side folded in the UI.
 *
 * Pilot view (D1) keeps only the displayed side's flights, support and AI
 * groups. The opposing coalition and the neutral coalition lose their
 * flights, support, AI groups and navigation points; the opposing bullseye is
 * replaced by an unresolved position; enemy airbases are removed, and the
 * opposing coalition's airbase list is emptied (it is built from that side's
 * group waypoints, so it would show where the enemy flies from); the opposing
 * side's mission task text and briefing images are cleared (D1). The neutral
 * task text, the neutral images and the server images are kept.
 * Hidden items and late-activation AI groups are removed everywhere (G11, FR-70).
 *
 * Zones and ME drawings are mission-level data: the normalizer gives every
 * coalition the same arrays, and the map reads the blue collection. Pilot view
 * keeps what a player of the displayed side sees on the DCS F10 map: trigger
 * zones are editor-only and are removed; drawings are kept only on the displayed
 * side's layer and the Neutral and Common layers, and only when the layer is
 * visible. The Author layer, the opposing side's layer and layers with an
 * unknown name are removed (D1).
 *
 * Issues that carry a `side` are kept only for the displayed side (D1). Issues
 * without a side describe the whole mission and are kept. Issues that only
 * hidden or late-activation groups reported (`hiddenSource`) are removed with
 * those groups (D1, G11).
 */
export function applyViewMode(mission: MissionData, viewMode: ViewMode, side?: Side | null): MissionData {
  if (viewMode === 'creator') return mission;

  const shown = resolveSide(mission, side);
  const opposing = shown === 'blue' ? 'red' : 'blue';
  const opposingOwner = OPPOSITE_OWNER[shown];
  const drawingLayers = new Set<string>([shown, 'neutral', 'common']);
  const keepDrawing = (drawing: Drawing) =>
    drawing.visible !== false && !hasHiddenFlag(drawing) && drawingLayers.has(drawing.layer.trim().toLowerCase());

  return {
    ...mission,
    meta: withoutOpposingTask(mission.meta, opposing),
    issues: mission.issues.filter(issue => !issue.hiddenSource && (issue.side === undefined || issue.side === shown)),
    coalitions: {
      blue: pilotCoalition(mission.coalitions.blue, { keepTacticalData: shown === 'blue', opposingOwner, isOpposing: opposing === 'blue', keepDrawing }),
      red: pilotCoalition(mission.coalitions.red, { keepTacticalData: shown === 'red', opposingOwner, isOpposing: opposing === 'red', keepDrawing }),
      neutral: pilotCoalition(mission.coalitions.neutral, { keepTacticalData: false, opposingOwner, isOpposing: false, keepDrawing }),
    },
  };
}

/**
 * Clear the mission task text and the briefing images of the opposing side (D1). The shared neutral
 * text is not touched. Without the per-side image lists the origin of an image is unknown, so pilot
 * view keeps none (fail closed).
 */
function withoutOpposingTask(meta: MissionMeta, opposing: Side): MissionMeta {
  const task = opposing === 'blue' ? { descriptionBlueTask: '' } : { descriptionRedTask: '' };
  const bySide = meta.imagesBySide;
  if (!bySide) return { ...meta, ...task, images: [] };
  const imagesBySide: MissionImagesBySide = { ...bySide, [opposing]: [] };
  return {
    ...meta,
    ...task,
    images: [...imagesBySide.blue, ...imagesBySide.red, ...imagesBySide.neutral, ...imagesBySide.server],
    imagesBySide,
  };
}

interface PilotOptions {
  /** True for the displayed side: its tactical data is kept. */
  keepTacticalData: boolean;
  /** Owner string of the opposing side, for airbase filtering (for example "RED"). */
  opposingOwner: string;
  /** True for the opposing side: even its bullseye position is withheld. */
  isOpposing: boolean;
  /** True for a drawing the displayed side sees on the F10 map. */
  keepDrawing: (drawing: Drawing) => boolean;
}

function pilotCoalition(coalition: Coalition, options: PilotOptions): Coalition {
  const { keepTacticalData, opposingOwner, isOpposing, keepDrawing } = options;
  // The opposing coalition's list comes from its own groups' waypoints (hidden ones too), so none of it is kept.
  const airbases = isOpposing
    ? []
    : (coalition.airbases ?? []).filter(airbase => (airbase.owner ?? '').toUpperCase() !== opposingOwner);

  if (!keepTacticalData) {
    return {
      ...coalition,
      bullseye: isOpposing ? { xy: [0, 0], latlon: [0, 0], latlonResolved: false } : coalition.bullseye,
      navPoints: [],
      airbases,
      flights: [],
      support: [],
      aiGroups: [],
      zones: [],
      drawings: coalition.drawings.filter(keepDrawing),
    };
  }

  return {
    ...coalition,
    airbases,
    flights: coalition.flights.filter(pilotKeepsFlight),
    support: coalition.support.filter(pilotKeepsSupport),
    aiGroups: coalition.aiGroups.filter(pilotKeepsAIGroup),
    zones: [],
    drawings: coalition.drawings.filter(keepDrawing),
  };
}

/** Pilot view keeps a flight (a group with a Client or Player unit) unless it is hidden; late activation does not matter (G11). */
function pilotKeepsFlight(flight: { hidden?: boolean }): boolean {
  return !hasHiddenFlag(flight);
}

/** Pilot view keeps a support asset (tanker, AWACS, carrier, JTAC) unless it is hidden, late activation or not (G11). */
function pilotKeepsSupport(asset: { hidden?: boolean }): boolean {
  return !hasHiddenFlag(asset);
}

/** Pilot view removes hidden and late-activation AI groups (G11, FR-70). */
function pilotKeepsAIGroup(group: { hidden?: boolean; lateActivation: boolean }): boolean {
  return !hasHiddenFlag(group) && !group.lateActivation;
}

/** What a source group is, in terms of the pilot view lists it lands in. */
export interface PilotGroupFacts {
  hidden: boolean;
  lateActivation: boolean;
  /** A unit is a Client or Player slot: the group is in the flights list. */
  client: boolean;
  /** The group is a support asset (see `supportKindOf`): it is in the support list. */
  support: boolean;
}

/**
 * True when pilot view shows the group in at least one of its lists (flights, support, AI groups), by the
 * same filters applyViewMode uses. The revision comparison reads it, so a pilot comparison lists the groups
 * the pilot view shows: a late-activation tanker stays (the support and comms screens show it), a
 * late-activation AI strike group does not.
 */
export function shownInPilotView(group: PilotGroupFacts): boolean {
  return (group.client && pilotKeepsFlight(group))
    || (group.support && pilotKeepsSupport(group))
    || pilotKeepsAIGroup(group);
}

function hasClientUnit(flight: Flight): boolean {
  return (flight.units ?? []).some(unit => {
    const skill = (unit.skill ?? '').toLowerCase();
    return skill === 'client' || skill === 'player';
  });
}

/**
 * Read a runtime `hidden` flag without widening the types or treating a missing
 * flag as hidden. Drawing has no typed `hidden` field (the source does not set one).
 */
function hasHiddenFlag(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  return (value as Record<string, unknown>).hidden === true;
}
