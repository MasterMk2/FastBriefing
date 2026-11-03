import type { Coalition, DisplaySettings, Drawing, Flight, MissionData, MissionMeta, Side } from '../types/mission';

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
 * replaced by an unresolved position; enemy airbases are removed; the opposing
 * side's mission task text is cleared (D1). The neutral task text is kept.
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
 * without a side describe the whole mission and are kept.
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
    issues: mission.issues.filter(issue => issue.side === undefined || issue.side === shown),
    coalitions: {
      blue: pilotCoalition(mission.coalitions.blue, { keepTacticalData: shown === 'blue', opposingOwner, isOpposing: opposing === 'blue', keepDrawing }),
      red: pilotCoalition(mission.coalitions.red, { keepTacticalData: shown === 'red', opposingOwner, isOpposing: opposing === 'red', keepDrawing }),
      neutral: pilotCoalition(mission.coalitions.neutral, { keepTacticalData: false, opposingOwner, isOpposing: false, keepDrawing }),
    },
  };
}

/** Clear the mission task text of the opposing side (D1). The shared neutral text is not touched. */
function withoutOpposingTask(meta: MissionMeta, opposing: Side): MissionMeta {
  return opposing === 'blue'
    ? { ...meta, descriptionBlueTask: '' }
    : { ...meta, descriptionRedTask: '' };
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
  const airbases = (coalition.airbases ?? []).filter(airbase => (airbase.owner ?? '').toUpperCase() !== opposingOwner);

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
    flights: coalition.flights.filter(item => !hasHiddenFlag(item)),
    support: coalition.support.filter(item => !hasHiddenFlag(item)),
    aiGroups: coalition.aiGroups.filter(item => !hasHiddenFlag(item) && !item.lateActivation),
    zones: [],
    drawings: coalition.drawings.filter(keepDrawing),
  };
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
