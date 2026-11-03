import type { BriefingSection } from '../utils/briefingSections';
import type { DisplaySettings, Side } from '../types/mission';

/**
 * Types only (P0). P3 (出力) implements the planner that reads these, in this
 * file and in src/export/exportModel.ts.
 */
export type ExportScope =
  | { kind: 'mission' }
  | { kind: 'side'; side: Side }
  | { kind: 'flights'; flightKeys: string[] }
  | { kind: 'aircraft'; aircraftType: string };

export interface ExportPlan {
  viewMode: DisplaySettings['viewMode'];
  outputLanguage: DisplaySettings['outputLanguage'];
  sections: BriefingSection[];
  scope: ExportScope;
  kneeboardWidth: DisplaySettings['kneeboardWidth'];
}
