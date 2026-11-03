// Owner: P4 (概要とブリーフィング). Reads the readiness flag of the pre-distribution rules.
// The flag belongs to P5: src/analysis/lint.ts exports `LINT_RULES_READY: boolean` next to
// lintMission, and P5 sets it to true when rules L1 to L10 exist. P4 only reads it here, so P5
// never has to edit a P4 file. While the export is missing or false, the overview says the check
// has not run instead of showing a false "no problems".
import * as lintModule from '../analysis/lint';

// Read by name at run time: a static property access would make the bundler warn while P5's export is still missing.
const READY_EXPORT = 'LINT_RULES_READY';

export function lintRulesReady(): boolean {
  return Reflect.get(lintModule, READY_EXPORT) === true;
}
