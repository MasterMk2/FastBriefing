// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../hooks/useSettings';
import { i18nReady } from '../i18n';
import type { MissionRevision, RevisionFlight, RevisionPoint } from '../utils/missionRevision';
import RevisionComparison, { type LoadedRevision } from './RevisionComparison';

vi.mock('./RevisionMap', () => ({ default: () => <div data-testid="revision-map">Map</div> }));

function flight(overrides: Partial<RevisionFlight> = {}): RevisionFlight {
  return { id: '1', name: 'Alpha', side: 'blue', category: 'plane', hidden: false, route: [], units: [], radio: null, ...overrides };
}

function point(eta: number): RevisionPoint {
  return { index: 1, name: 'IP', data: { x: 1000, y: 2000, ETA: eta } };
}

function revision(flights: RevisionFlight[]): MissionRevision {
  return { theatre: 'Caucasus', startTime: 36000, flights };
}

function loaded(name: string, value: MissionRevision): LoadedRevision {
  return { name, fingerprint: name, revision: value };
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  await i18nReady;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

/** Pilot view shows the blue side (D1); the fixture flights are blue. */
async function render(before: LoadedRevision, after: LoadedRevision) {
  await act(async () => {
    root.render(
      <RevisionComparison
        revisions={[before, after]}
        settings={{ ...DEFAULT_SETTINGS, viewMode: 'pilot' }}
        side="blue"
        onClose={() => {}}
      />,
    );
  });
}

function rowTexts(): string[] {
  return [...container.querySelectorAll('.revision-table tbody tr')].map(row => row.textContent ?? '');
}

describe('revision comparison view (F10)', () => {
  it('says there are no differences when the same version is compared, and shows no change table', async () => {
    const same = revision([flight({ route: [point(600)] })]);

    await render(loaded('old.miz', same), loaded('new.miz', same));

    expect(container.querySelector('.revision-count')?.textContent).toBe('差分はありません');
    expect(container.querySelector('.revision-table')).toBeNull();
  });

  it('labels a flight with the same group ID and a different name as a rename', async () => {
    await render(
      loaded('old.miz', revision([flight({ name: 'Alpha' })])),
      loaded('new.miz', revision([flight({ name: 'Bravo' })])),
    );

    const renamed = rowTexts().find(text => text.includes('名前変更'));
    expect(renamed).toBeDefined();
    expect(renamed).toContain('Bravo');
  });

  it('shows an ETA change as signed minutes and seconds next to the raw values', async () => {
    await render(
      loaded('old.miz', revision([flight({ route: [point(600)] })])),
      loaded('new.miz', revision([flight({ route: [point(690)] })])),
    );

    expect(container.querySelector('.revision-delta')?.textContent).toContain('(+1:30)');

    await render(
      loaded('old.miz', revision([flight({ route: [point(690)] })])),
      loaded('new.miz', revision([flight({ route: [point(600)] })])),
    );

    expect(container.querySelector('.revision-delta')?.textContent).toContain('(−1:30)');
  });
});
