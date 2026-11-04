import i18n from '../i18n';
import type { IssueCode, MissionIssue } from '../types/mission';

/**
 * Display text for a mission issue. The message lives in the `issues` namespace,
 * keyed by the issue code (for example "issues:map.unsupported"), so the code stays
 * stable and the wording can change per language.
 */
export function issueText(issue: MissionIssue): string {
  return i18n.t(`issues:${issue.code}`, { ...issue.params });
}

/**
 * Distinct display texts of all issues, in order. Two issues with the same text
 * (for example one per coalition) are listed once.
 */
export function issueTextList(issues: readonly MissionIssue[]): string[] {
  return [...new Set(issues.map(issueText))];
}

/** Distinct display texts of the issues that have one of the given codes, sorted. */
export function issueTexts(issues: readonly MissionIssue[], codes: readonly IssueCode[]): string[] {
  const selected = issues.filter(issue => codes.includes(issue.code)).map(issueText);
  return [...new Set(selected)].sort();
}
