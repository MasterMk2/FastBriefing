// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18nReady } from '../i18n';
import {
  makeAIGroup,
  makeCoalition,
  makeFlight,
  makeMission,
  makeRoutePoint,
  makeUnit,
} from '../__tests__/testMission';
import ThreatsScreen from './ThreatsScreen';
import { mountScreen, type MountedScreen } from '../__tests__/testRender';
import { useWorkspace } from '../shell/workspace';
import { useEffect } from 'react';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

/** Jumps to an anchor when it mounts, as the overview's "この箇所へ" does. */
function JumpTo({ anchor }: { anchor: string }) {
  const { jumpTo } = useWorkspace();
  useEffect(() => {
    jumpTo('threats', { anchor });
  }, [anchor, jumpTo]);
  return null;
}

/** Blue flight flies x = 0 to 20000 m along y = 0. Red SAM at (15000, 0), range 18000 m: both legs inside. */
function makeThreatMission() {
  return makeMission({
    blue: makeCoalition({
      flights: [makeFlight({
        groupId: 1,
        callsign: 'Viper 1-1',
        name: 'Viper',
        units: [makeUnit({ skill: 'Client' })],
        route: [
          makeRoutePoint({ index: 1, xy: [0, 0] }),
          makeRoutePoint({ index: 2, xy: [10000, 0] }),
          makeRoutePoint({ index: 3, xy: [20000, 0] }),
        ],
      })],
    }),
    red: makeCoalition({
      aiGroups: [
        makeAIGroup({
          type: 'SA-2',
          position: [15000, 0],
          threatRange: 18000,
          threatRangeSource: 'reference',
          threatRangeUnitType: 'SA-2 LN',
          detectionRange: 0,
        }),
        makeAIGroup({
          type: 'Mystery',
          position: [0, 0],
          latlonResolved: false,
          latlon: undefined,
          threatRange: 0,
          threatRangeSource: 'unknown',
        }),
      ],
    }),
  });
}

let screen: MountedScreen | null = null;

beforeEach(async () => {
  await i18nReady;
});

afterEach(async () => {
  await screen?.unmount();
  screen = null;
  localStorage.clear();
});

describe('ThreatsScreen (P5)', () => {
  it('shows the empty state in pilot view and never lists threats or crossings (D1)', async () => {
    screen = await mountScreen(<ThreatsScreen />, makeThreatMission(), 'pilot');

    const text = screen.text();
    expect(text).toContain('脅威はパイロット表示では出しません');
    expect(text).not.toContain('SA-2');
    expect(text).not.toContain('Mystery');
    expect(text).not.toContain('Viper 1-1');
  });

  it('reports the crossing of an own-side flight with a reference threat as inside, with the legs', async () => {
    screen = await mountScreen(<ThreatsScreen />, makeThreatMission(), 'creator');

    expect(screen.text()).toContain('SA-2：区間 1〜3 で圏内');
    expect(screen.text()).toContain('理論上の水平距離');
  });

  it('shows an unrecorded range as 未収録 and never as なし', async () => {
    screen = await mountScreen(<ThreatsScreen />, makeThreatMission(), 'creator');

    const rows = [...screen.container.querySelectorAll('.threats-table tbody tr')];
    const mystery = rows.find(row => row.textContent?.includes('Mystery'));
    expect(mystery?.textContent).toContain('未収録（範囲不明）');
    expect(screen.text()).not.toContain('なし');
  });

  it('shows the reference unit as the source of a recorded range', async () => {
    screen = await mountScreen(<ThreatsScreen />, makeThreatMission(), 'creator');

    expect(screen.text()).toContain('参照データ（SA-2 LN）');
  });

  it('lists the own side\'s unrecorded groups too, with their side mark (L8 links here)', async () => {
    const mission = makeThreatMission();
    mission.coalitions.blue.aiGroups = [makeAIGroup({
      type: 'OwnMystery',
      position: [5000, 5000],
      latlonResolved: false,
      latlon: undefined,
      threatRange: 0,
      threatRangeSource: 'unknown',
    })];
    screen = await mountScreen(<ThreatsScreen />, mission, 'creator');

    const rows = [...screen.container.querySelectorAll('.threats-table tbody tr')];
    const own = rows.find(row => row.textContent?.includes('OwnMystery'));
    expect(own?.querySelector('.side-mark')?.getAttribute('data-side')).toBe('blue');
    expect(own?.textContent).toContain('未収録（範囲不明）');
  });

  it('says the flight is outside when no leg is inside or grazing', async () => {
    const mission = makeThreatMission();
    mission.coalitions.red.aiGroups = [makeAIGroup({
      type: 'SA-6',
      position: [100000, 100000],
      threatRange: 5000,
      threatRangeSource: 'reference',
    })];
    screen = await mountScreen(<ThreatsScreen />, mission, 'creator');

    expect(screen.text()).toContain('外れない');
  });

  it('says a leg is grazing when it passes within 1 nm outside the range, and states how a mixed group is judged', async () => {
    const mission = makeThreatMission();
    // The SAM sits 19000 m from the whole route (y = 0), so the nearest distance is 1000 m outside the 18000 m range.
    mission.coalitions.red.aiGroups = [makeAIGroup({
      type: 'SA-2',
      position: [10000, 19000],
      threatRange: 18000,
      threatRangeSource: 'reference',
      detectionRange: 0,
    })];
    screen = await mountScreen(<ThreatsScreen />, mission, 'creator');

    expect(screen.text()).toContain('でかすめる（圏外 1 nm 以内）');
    expect(screen.text()).not.toContain('で圏内');
    expect(screen.text()).toContain('同じ群に範囲が未収録のユニットがあっても');
  });

  it('anchors each threat row at threats:<side>:<index>, the target of lint L8', async () => {
    screen = await mountScreen(<ThreatsScreen />, makeThreatMission(), 'creator');

    expect(screen.container.querySelector('[data-anchor="threats:red:0"]')?.textContent).toContain('SA-2');
    expect(screen.container.querySelector('[data-anchor="threats:red:1"]')?.textContent).toContain('Mystery');
  });

  it('focuses the row an L8 anchor names, and clears the anchor', async () => {
    screen = await mountScreen(
      <><JumpTo anchor="threats:red:1" /><ThreatsScreen /></>,
      makeThreatMission(),
      'creator',
    );

    const row = screen.container.querySelector<HTMLElement>('[data-anchor="threats:red:1"]');
    expect(document.activeElement).toBe(row);
    expect(row?.classList.contains('is-target')).toBe(true);
    expect(screen.workspace()?.focusAnchor).toBeNull();
  });
});
