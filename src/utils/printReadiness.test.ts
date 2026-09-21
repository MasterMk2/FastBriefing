import { describe, expect, it, vi } from 'vitest';
import { installPrintReadinessGuard, PRINT_MAP_BLOCKED_CLASS } from './printReadiness';

describe('native print readiness guard', () => {
  it('fails closed for native print while the map is blocked and clears after printing', () => {
    const listeners = new Map<string, () => void>();
    const classes = new Set<string>();
    const events = {
      addEventListener: vi.fn((type: string, listener: () => void) => listeners.set(type, listener)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    };
    const root = {
      classList: {
        toggle: (name: string, force?: boolean) => {
          if (force) classes.add(name);
          else classes.delete(name);
          return Boolean(force);
        },
        remove: (name: string) => { classes.delete(name); },
      },
    };

    let blocked = true;
    const cleanup = installPrintReadinessGuard(events, root, () => blocked);
    listeners.get('beforeprint')?.();
    expect(classes.has(PRINT_MAP_BLOCKED_CLASS)).toBe(true);

    listeners.get('afterprint')?.();
    expect(classes.has(PRINT_MAP_BLOCKED_CLASS)).toBe(false);

    blocked = false;
    classes.add(PRINT_MAP_BLOCKED_CLASS);
    listeners.get('beforeprint')?.();
    expect(classes.has(PRINT_MAP_BLOCKED_CLASS)).toBe(false);

    cleanup();
    expect(listeners.size).toBe(0);
    expect(classes.has(PRINT_MAP_BLOCKED_CLASS)).toBe(false);
  });
});
