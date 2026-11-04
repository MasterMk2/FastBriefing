import type { IssueSeverity } from './mission';
import type { ScreenId } from './screen';

/**
 * One result of the pre-distribution checks (F5). Rules (L1 to L10) are
 * implemented in src/analysis/lint.ts (P5); the shape is fixed here.
 */
export interface LintFinding {
  id: string;
  /** Rule code such as "L1" to "L10" (see SPEC section 5.1 F5). */
  code: string;
  severity: IssueSeverity;
  side: 'blue' | 'red' | 'neutral';
  /** Screen that shows the place to fix (the "この箇所へ" target). */
  screen: ScreenId;
  /** Anchor inside that screen (for example a route point id), when there is one. */
  anchor?: string;
  flightKey?: string;
  /** Interpolation values for the `lint` namespace message. */
  params: Record<string, string | number>;
}
