// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18nReady } from '../i18n';
import { makeCoalition, makeFlight, makeMission, makeSupport, makeUnit } from '../__tests__/testMission';
import CommsScreen from './CommsScreen';
import { mountScreen, type MountedScreen } from '../__tests__/testRender';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const client = (overrides: Parameters<typeof makeUnit>[0] = {}) => makeUnit({ skill: 'Client', ...overrides });
const preset = (frequencyHz: number, modulation = 0) => ({ channel: 1, frequency: frequencyHz, modulation, name: 'Tactical' });

/**
 * Blue: two flights sharing 251.000 MHz AM (a conflict) and one FM preset.
 * Red: an opposing flight (Ford 9-9) and an opposing AWACS (Darkstar), both must stay out of pilot view.
 */
function makeCommsMission() {
  return makeMission({
    blue: makeCoalition({
      flights: [
        makeFlight({ groupId: 1, callsign: 'Viper 1-1', name: 'Viper', units: [client({ radios: [preset(251000000)] })] }),
        makeFlight({ groupId: 2, callsign: 'Viper 2-1', name: 'Vanguard', units: [client({ unitId: 2, radios: [preset(251000000), preset(260000000, 1)] })] }),
      ],
      support: [makeSupport({ kind: 'tanker', callsign: 'Texaco', frequency: 305000000, tacan: { channel: '37', mode: 'X' } })],
    }),
    red: makeCoalition({
      flights: [makeFlight({ groupId: 3, callsign: 'Ford 9-9', name: 'Ford', units: [client({ unitId: 9, radios: [preset(270000000)] })] })],
      support: [makeSupport({ kind: 'awacs', callsign: 'Darkstar', frequency: 270000000 })],
    }),
  });
}

/** Rows of the frequency list (the first comms table; the TACAN table comes after it). */
function frequencyRows(mounted: MountedScreen): HTMLTableRowElement[] {
  const table = mounted.container.querySelector<HTMLTableElement>('.comms-table');
  return [...(table?.querySelectorAll<HTMLTableRowElement>('tbody tr') ?? [])];
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

describe('CommsScreen (P5)', () => {
  it('lists the frequency conflict first and names both owners', async () => {
    screen = await mountScreen(<CommsScreen />, makeCommsMission(), 'creator');

    const text = screen.text();
    expect(text).toContain('251.000 MHz（AM）');
    expect(text).toContain('別のフライトと同じ周波数');
    expect(screen.container.querySelector('.comms-conflicts')?.textContent).toContain('Viper 1-1');
    expect(screen.container.querySelector('.comms-conflicts')?.textContent).toContain('Viper 2-1');
  });

  it('keeps the opposing side out of pilot view (D1)', async () => {
    screen = await mountScreen(<CommsScreen />, makeCommsMission(), 'pilot');

    const text = screen.text();
    expect(text).not.toContain('Ford 9-9');
    expect(text).not.toContain('Darkstar');
    expect(text).not.toContain('270.000');
    expect(text).toContain('Viper 1-1');
  });

  it('shows the opposing side in creator view', async () => {
    screen = await mountScreen(<CommsScreen />, makeCommsMission(), 'creator');
    expect(screen.text()).toContain('Ford 9-9');
  });

  it('opens the owning flight from a conflict row', async () => {
    screen = await mountScreen(<CommsScreen />, makeCommsMission(), 'pilot');

    // The conflict row and the table row both read "Viper 1-1"; either opens the same flight.
    await screen.click('Viper 1-1');

    expect(screen.workspace()?.screen).toBe('flights');
    expect(screen.workspace()?.flightKey).toBe('blue:1');
  });

  it('opens the support screen from a support owner row', async () => {
    screen = await mountScreen(<CommsScreen />, makeCommsMission(), 'pilot');

    await screen.click('給油機 Texaco');

    expect(screen.workspace()?.screen).toBe('support');
  });

  it('filters the table by modulation and says how many rows are shown', async () => {
    screen = await mountScreen(<CommsScreen />, makeCommsMission(), 'pilot');
    const before = frequencyRows(screen).length;

    await screen.clickInGroup('変調で絞り込む', 'FM');

    const rows = frequencyRows(screen);
    expect(rows.length).toBeLessThan(before);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(row => row.textContent?.includes('FM'))).toBe(true);
    expect(screen.text()).toContain('件中');
  });

  it('shows the empty-state text when nothing matches the filter, with a way out', async () => {
    screen = await mountScreen(<CommsScreen />, makeCommsMission(), 'pilot');

    await screen.clickInGroup('変調で絞り込む', 'FM');
    await screen.clickInGroup('陣営で絞り込む', '赤');

    expect(screen.text()).toContain('条件に合う周波数がありません');
    await screen.click('絞り込みを解除');
    expect(frequencyRows(screen).length).toBeGreaterThan(0);
  });

  it('marks ATC as not recorded and shows the guard frequencies', async () => {
    screen = await mountScreen(<CommsScreen />, makeCommsMission(), 'pilot');

    expect(screen.text()).toContain('管制周波数（ATC）は未収録です');
    expect(screen.text()).toContain('243.000 MHz（AM）');
    expect(screen.text()).toContain('121.500 MHz（AM）');
  });

  it('sorts by owner with the numeric flight number (2 before 10), not as text', async () => {
    const mission = makeMission({
      blue: makeCoalition({
        flights: [
          makeFlight({ groupId: 10, callsign: 'Viper 10-1', name: 'Ten', units: [client({ radios: [preset(240000000)] })] }),
          makeFlight({ groupId: 2, callsign: 'Viper 2-1', name: 'Two', units: [client({ unitId: 2, radios: [preset(260000000)] })] }),
        ],
      }),
    });
    screen = await mountScreen(<CommsScreen />, mission, 'pilot');

    await screen.clickInGroup('並び順', '所属順');

    const owners = frequencyRows(screen).map(row => row.querySelector('button')?.textContent);
    expect(owners).toEqual(['Viper 2-1', 'Viper 10-1']);
  });

  it('anchors the conflict and its two table rows at the lint L1 anchor', async () => {
    screen = await mountScreen(<CommsScreen />, makeCommsMission(), 'creator');

    // One conflict item and the two rows that use 251.000 MHz AM; the FM row and the 270 MHz pair are not in it.
    const anchored = screen.container.querySelectorAll('[data-anchor="comms:conflict:AM:251.000"]');
    expect(anchored).toHaveLength(3);
    expect(anchored[0].classList.contains('comms-conflict')).toBe(true);
  });

  it('shows the no-conflict note and the empty frequency state when no flight or support has a frequency', async () => {
    const mission = makeMission({
      blue: makeCoalition({ flights: [makeFlight({ groupId: 1, callsign: 'Viper 1-1', units: [client()] })] }),
    });
    screen = await mountScreen(<CommsScreen />, mission, 'pilot');

    expect(screen.text()).toContain('衝突はありません');
    expect(screen.text()).toContain('周波数はありません');
    expect(frequencyRows(screen)).toHaveLength(0);
  });

  it('shows the no-conflict note with the frequency table when the frequencies do not overlap', async () => {
    const mission = makeMission({
      blue: makeCoalition({ flights: [makeFlight({ groupId: 1, callsign: 'Viper 1-1', name: 'Viper', units: [client({ radios: [preset(251000000)] })] })] }),
      red: makeCoalition({ flights: [makeFlight({ groupId: 2, callsign: 'Ford 1-1', name: 'Ford', units: [client({ unitId: 9, radios: [preset(270000000)] })] })] }),
    });
    screen = await mountScreen(<CommsScreen />, mission, 'creator');

    expect(screen.container.querySelector('.comms-conflict-list')).toBeNull();
    expect(screen.text()).toContain('衝突はありません');
    expect(frequencyRows(screen)).toHaveLength(2);
  });

  it('says in creator view that the comparison covers both sides', async () => {
    screen = await mountScreen(<CommsScreen />, makeCommsMission(), 'creator');

    expect(screen.text()).toContain('両陣営の周波数をまとめて比べます');
  });
});
