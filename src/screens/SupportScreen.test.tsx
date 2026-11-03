// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18nReady } from '../i18n';
import { makeCoalition, makeFlight, makeMission, makeSupport, makeUnit } from '../__tests__/testMission';
import SupportScreen from './SupportScreen';
import { mountScreen, type MountedScreen } from '../__tests__/testRender';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function makeSupportMission() {
  return makeMission({
    blue: makeCoalition({
      flights: [makeFlight({ groupId: 1, units: [makeUnit({ skill: 'Client' })] })],
      support: [
        makeSupport({ kind: 'tanker', callsign: 'Texaco', frequency: 305000000, tacan: { channel: '37', mode: 'X' } }),
        makeSupport({ kind: 'jtac', callsign: 'Hammer', laserCode: 1688, hidden: true }),
        makeSupport({ kind: 'awacs', callsign: 'Magic', frequency: 270000000, latlonResolved: false, latlon: undefined, position: [1200, -300] }),
      ],
    }),
    red: makeCoalition({
      support: [makeSupport({ kind: 'awacs', callsign: 'Darkstar', frequency: 270000000 })],
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

describe('SupportScreen (P5)', () => {
  it('groups the displayed side\'s support assets by kind', async () => {
    screen = await mountScreen(<SupportScreen />, makeSupportMission(), 'pilot');

    const text = screen.text();
    expect(text).toContain('給油機');
    expect(text).toContain('Texaco');
    expect(text).toContain('37 X');
    expect(text).toContain('305.000 MHz');
    expect(text).toContain('AWACS');
    expect(text).toContain('Magic');
    // The lint anchor of each row (support:<side>:<index in the coalition list>).
    expect(screen.container.querySelector('[data-anchor="support:blue:0"]')?.textContent).toContain('Texaco');
  });

  it('removes hidden support assets and the opposing side in pilot view (G11, D1)', async () => {
    screen = await mountScreen(<SupportScreen />, makeSupportMission(), 'pilot');

    expect(screen.text()).not.toContain('Hammer');
    expect(screen.text()).not.toContain('Darkstar');
  });

  it('shows the opposing side in creator view, inside a collapsed block', async () => {
    screen = await mountScreen(<SupportScreen />, makeSupportMission(), 'creator');

    expect(screen.container.querySelector('.support-opposing')).not.toBeNull();
    expect(screen.text()).toContain('Darkstar');
    expect(screen.text()).toContain('Hammer');
  });

  it('shows an unresolved position as unresolved with its DCS X/Y, and never as 0, 0', async () => {
    screen = await mountScreen(<SupportScreen />, makeSupportMission(), 'pilot');

    const magic = [...screen.container.querySelectorAll('.support-item')]
      .find(item => item.textContent?.includes('Magic'));
    expect(magic?.textContent).toContain('未解決');
    expect(magic?.textContent).toContain('1200, -300');
  });

  it('links the frequency to the comms screen', async () => {
    screen = await mountScreen(<SupportScreen />, makeSupportMission(), 'pilot');

    await screen.click('305.000 MHz');

    expect(screen.workspace()?.screen).toBe('comms');
  });

  it('marks each row with its side (SPEC 1.4 side mark)', async () => {
    screen = await mountScreen(<SupportScreen />, makeSupportMission(), 'creator');

    const rowOf = (name: string) => [...screen!.container.querySelectorAll('.support-item')]
      .find(item => item.textContent?.includes(name));
    expect(rowOf('Texaco')?.querySelector('.side-mark')?.getAttribute('data-side')).toBe('blue');
    expect(rowOf('Darkstar')?.querySelector('.side-mark')?.getAttribute('data-side')).toBe('red');
  });

  it('shows the empty state when the mission has no support assets', async () => {
    screen = await mountScreen(<SupportScreen />, makeMission(), 'pilot');

    expect(screen.text()).toContain('支援機はありません');
  });
});
