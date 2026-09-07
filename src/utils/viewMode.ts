import type { Coalition, DisplaySettings, MissionData } from '../types/mission';

/**
 * Return the mission data visible in the requested view.
 *
 * Creator view deliberately returns the original object so switching views
 * does not create work when no filtering is required. Pilot view keeps the
 * MissionData shape intact while filtering every coalition-owned collection
 * that can carry a hidden flag.
 */
export function applyViewMode(mission: MissionData, viewMode: DisplaySettings['viewMode']): MissionData {
  if (viewMode === 'creator') return mission;

  return {
    ...mission,
    coalitions: {
      blue: filterCoalition(mission.coalitions.blue),
      red: filterCoalition(mission.coalitions.red),
      neutral: filterCoalition(mission.coalitions.neutral),
    },
  };
}

function filterCoalition(coalition: Coalition): Coalition {
  return {
    ...coalition,
    flights: coalition.flights.filter(item => !hasHiddenFlag(item)),
    support: coalition.support.filter(item => !hasHiddenFlag(item)),
    aiGroups: coalition.aiGroups.filter(item => !hasHiddenFlag(item)),
    zones: coalition.zones.filter(item => !hasHiddenFlag(item)),
    drawings: coalition.drawings.filter(item => !hasHiddenFlag(item)),
  };
}

/**
 * SupportAsset and Drawing predate view-mode filtering in the public type
 * definitions. Read the runtime property without widening those types or
 * treating a missing flag as hidden.
 */
function hasHiddenFlag(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  return (value as Record<string, unknown>).hidden === true;
}
