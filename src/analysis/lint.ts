// STUB. Owner: P5 (通信・支援機・脅威). P5 replaces this file's body with rules L1 to L10 (SPEC 5.1 F5).
// Contract (frozen): named export lintMission below. Callers pass the mission as displayed
// (`useMission().view`), so pilot view never checks the opposing side (D1).
// Findings are sorted error, warning, info.
import type { MissionData } from '../types/mission';
import type { LintFinding } from '../types/lint';

export function lintMission(_mission: MissionData): LintFinding[] {
  return [];
}
