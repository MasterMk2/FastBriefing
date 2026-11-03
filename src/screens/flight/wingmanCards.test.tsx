// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsProvider } from '../../hooks/useSettings';
import { i18nReady } from '../../i18n';
import { MissionProvider } from '../../shell/MissionContext';
import { useWorkspace, WorkspaceProvider } from '../../shell/workspace';
import type { Coalition, Flight, MissionData, RoutePoint, Unit } from '../../types/mission';
import { emptyUserNotes } from '../../utils/notes';
import { reloadWingmanSlot, WINGMAN_STORAGE_KEY, writeWingmanSlot, type WingmanSlot } from '../../utils/wingmanSlot';
import LineupCard from './LineupCard';
import WingmanCard from './WingmanCard';

const SLOT: WingmanSlot = { missionKey: 'mission-A', flightKey: 'blue:5', unitId: 11 };

function leadUnit(): Unit {
  return {
    unitId: 11,
    name: 'Enfield 1-1',
    tailNumber: '010',
    skill: 'Client',
    livery: '',
    payload: {
      // Given in string order on purpose: station 10 must be shown after station 2.
      pylons: [
        { station: '10', clsid: 'AIM-120', name: 'AIM-120C', count: 1, weight: 0 },
        { station: '2', clsid: 'AIM-9', name: 'AIM-9X', count: 1, weight: 0 },
      ],
      fuel: 3000,
      chaff: 60,
      flare: 30,
      gun: 100,
      weight: 0,
    },
    radios: [
      { channel: 1, frequency: 251, modulation: 0, name: 'Guard' },
      { radio: 1, channel: 2, frequency: 262.5, modulation: 1, name: 'Ops' },
    ],
    props: {
      Sta2LaserCode: 1688,
      MountNVG: true,
      SomeUnknownKey: { nested: true },
    },
    datalink: { link16: { flightLead: true, team: 3 } },
  };
}

function wingUnit(): Unit {
  return {
    unitId: 12,
    name: 'Enfield 1-2',
    tailNumber: '011',
    skill: 'Client',
    livery: '',
    payload: { pylons: [], fuel: 2800, chaff: 0, flare: 0, gun: 0, weight: 0 },
    radios: [],
    props: {},
  };
}

function routePoints(): RoutePoint[] {
  return [
    {
      index: 1,
      name: 'WP1',
      action: 'Turning Point',
      xy: [1000, 2000],
      latlon: [35.5, 135.5],
      latlonResolved: true,
      alt: 6000,
      altType: 'BARO',
      speed: 200,
      eta: 0,
      tasks: [],
    },
    {
      index: 2,
      name: 'WP2',
      action: 'Turning Point',
      xy: [5000, 8000],
      latlon: [0, 0],
      latlonResolved: false,
      alt: 3000,
      altType: 'BARO',
      speed: 220,
      eta: 600,
      tasks: [],
      leg: { distance: 5000, trueBearing: 90, magneticBearing: 85, time: 90, cumulativeDistance: 5000 },
    },
  ];
}

function blueFlight(): Flight {
  return {
    groupId: 5,
    name: 'Enfield',
    callsign: 'Enfield',
    type: 'F-15C',
    task: 'CAP',
    frequency: 251000000,
    modulation: 0,
    hidden: false,
    units: [leadUnit(), wingUnit()],
    route: routePoints(),
  };
}

function redFlight(): Flight {
  return { ...blueFlight(), groupId: 9, name: 'Bandit', callsign: 'Bandit', units: [{ ...leadUnit(), unitId: 21 }] };
}

function makeMission(blue: Flight[], red: Flight[] = []): MissionData {
  const coalition = (flights: Flight[]): Coalition => ({
    bullseye: { xy: [0, 0], latlon: [0, 0], latlonResolved: false },
    navPoints: [],
    airbases: [],
    flights,
    support: [],
    aiGroups: [],
    zones: [],
    drawings: [],
  });
  return {
    sourceFingerprint: 'wingman-fixture',
    meta: {
      sortie: 'Wingman test',
      description: '',
      descriptionBlueTask: '',
      descriptionRedTask: '',
      descriptionNeutralTask: '',
      theatre: 'Test',
      date: { Year: 2026, Month: 1, Day: 1 },
      startTime: 0,
      utcOffset: 0,
      meVersion: 1,
      images: [],
    },
    weather: {} as MissionData['weather'],
    coalitions: { blue: coalition(blue), red: coalition(red), neutral: coalition([]) },
    userNotes: emptyUserNotes('mission-A'),
    issues: [],
  };
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let observedFlightKey: string | null = null;

/** Reports the selected flight without adding anything to the DOM. */
function WorkspaceProbe() {
  observedFlightKey = useWorkspace().flightKey;
  return null;
}

function setCreatorViewSetting() {
  localStorage.setItem('fastbriefing-settings', JSON.stringify({ settingsVersion: 5, viewMode: 'creator' }));
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  reloadWingmanSlot();
  observedFlightKey = null;
  await i18nReady;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
  localStorage.clear();
  reloadWingmanSlot();
});

/** Make window.matchMedia report the phone breakpoint (or not). jsdom has no matchMedia of its own. */
function stubPhoneWidth(phone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: phone, media: query, addEventListener() {}, removeEventListener() {} }),
  });
}

async function render(mission: MissionData, element: JSX.Element) {
  await act(async () => {
    root.render(
      <SettingsProvider>
        <MissionProvider
          mission={mission}
          sourceFile={null}
          storageFailed={false}
          revisions={null}
          onNotesChange={() => {}}
          onCloseRevisions={() => {}}
        >
          <WorkspaceProvider>
            <WorkspaceProbe />
            {element}
          </WorkspaceProvider>
        </MissionProvider>
      </SettingsProvider>,
    );
  });
}

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
    .find(item => item.textContent === text);
  if (!button) throw new Error(`button not found: ${text}`);
  return button;
}

async function click(element: HTMLElement) {
  await act(async () => { element.click(); });
}

describe('LineupCard', () => {
  it('lists the payload in station order and the known aircraft settings with labels', async () => {
    const flight = blueFlight();
    await render(makeMission([flight]), <LineupCard flight={flight} unit={flight.units[0]} />);

    const payloadTable = container.querySelectorAll('.lineup-table')[0];
    const stations = Array.from(payloadTable.querySelectorAll('tbody tr td:first-child')).map(cell => cell.textContent);
    expect(stations).toEqual(['2', '10']);

    expect(container.textContent).toContain('レーザーコード（ステーション2）');
    expect(container.textContent).toContain('1688');
    expect(container.textContent).toContain('NVG の取り付け');
    expect(container.textContent).toContain('Link16');
    expect(container.textContent).toContain('フライトリード: はい / チーム: 3');
    // Unknown keys are shown raw under the other settings, not dropped.
    expect(container.textContent).toContain('SomeUnknownKey');
    expect(container.textContent).toContain('{"nested":true}');
  });

  it('shows radio presets with their frequency in MHz and modulation', async () => {
    const flight = blueFlight();
    await render(makeMission([flight]), <LineupCard flight={flight} unit={flight.units[0]} />);

    const radioRows = Array.from(container.querySelectorAll('.lineup-table')[1].querySelectorAll('tbody tr'));
    expect(radioRows.map(row => row.querySelector('td')?.textContent)).toEqual(['1', '2']);
    expect(radioRows[0].textContent).toContain('251.000');
    expect(radioRows[0].textContent).toContain('AM');
    expect(radioRows[1].textContent).toContain('262.500');
    expect(radioRows[1].textContent).toContain('FM');
  });

  it('chooses this aircraft as the wingman, stores it, and shows the wingman card at once', async () => {
    const flight = blueFlight();
    await render(
      makeMission([flight]),
      <>
        <LineupCard flight={flight} unit={flight.units[0]} />
        <WingmanCard flight={flight} />
      </>,
    );
    expect(container.querySelector('.wingman-card')).toBeNull();

    await click(buttonByText('この機を自機にする'));

    expect(JSON.parse(localStorage.getItem(WINGMAN_STORAGE_KEY) ?? 'null')).toEqual(SLOT);
    expect(container.querySelector('.wingman-card')).not.toBeNull();
    expect(container.querySelector('.wingman-card-name')?.textContent).toContain('Enfield 1-1');
    expect(container.textContent).toContain('この端末の自機です');

    await click(buttonByText('自機を外す'));
    expect(localStorage.getItem(WINGMAN_STORAGE_KEY)).toBeNull();
    expect(container.querySelector('.wingman-card')).toBeNull();
  });

  it('moves the focus to the status line after choosing, and back to the choose button after clearing', async () => {
    const flight = blueFlight();
    await render(makeMission([flight]), <LineupCard flight={flight} unit={flight.units[0]} />);

    await click(buttonByText('この機を自機にする'));
    expect(document.activeElement?.textContent).toBe('この端末の自機です');

    await click(buttonByText('自機を外す'));
    expect(document.activeElement).toBe(buttonByText('この機を自機にする'));
  });

  it('keeps the choice on screen and shows a notice when the browser refuses the save', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const flight = blueFlight();
    await render(
      makeMission([flight]),
      <>
        <LineupCard flight={flight} unit={flight.units[0]} />
        <WingmanCard flight={flight} />
      </>,
    );

    await click(buttonByText('この機を自機にする'));

    expect(container.querySelector('.wingman-card')).not.toBeNull();
    expect(container.textContent).toContain('この端末に保存できません');
  });

  it('shows nothing for a flight of the other side in pilot view (D1)', async () => {
    const blue = blueFlight();
    const red = redFlight();
    await render(makeMission([blue], [red]), <LineupCard flight={red} unit={red.units[0]} />);

    expect(container.innerHTML).toBe('');
  });

  it('shows the lineup of the other side in creator view, so the pilot-view hiding is not vacuous', async () => {
    setCreatorViewSetting();
    const blue = blueFlight();
    const red = redFlight();
    await render(makeMission([blue], [red]), <LineupCard flight={red} unit={red.units[0]} />);

    expect(container.querySelector('.lineup-card')).not.toBeNull();
    expect(container.querySelectorAll('.lineup-table')).toHaveLength(2);
    expect(buttonByText('この機を自機にする')).not.toBeNull();
  });

  it('disables the choice with a stated reason when the mission has no key', async () => {
    const flight = blueFlight();
    const mission = { ...makeMission([flight]), userNotes: emptyUserNotes('') };
    await render(mission, <LineupCard flight={flight} unit={flight.units[0]} />);

    const choose = buttonByText('この機を自機にする');
    expect(choose.disabled).toBe(true);
    const reason = document.getElementById(choose.getAttribute('aria-describedby') ?? '');
    expect(reason?.textContent).toContain('識別子');
  });

  it('says the choice could not be cleared when the browser refuses the removal', async () => {
    const flight = blueFlight();
    writeWingmanSlot(SLOT);
    await render(makeMission([flight]), <LineupCard flight={flight} unit={flight.units[0]} />);
    expect(container.textContent).toContain('この端末の自機です');

    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    await click(buttonByText('自機を外す'));

    expect(container.textContent).toContain('この端末で自機の選択を消せませんでした');
    expect(buttonByText('この機を自機にする')).not.toBeNull();
  });
});

describe('WingmanCard', () => {
  it('renders nothing when no aircraft is chosen', async () => {
    const flight = blueFlight();
    await render(makeMission([flight]), <WingmanCard flight={flight} />);
    expect(container.innerHTML).toBe('');
  });

  it('steps through the route and marks an unresolved point without drawing [0, 0]', async () => {
    const flight = blueFlight();
    writeWingmanSlot(SLOT);
    await render(makeMission([flight]), <WingmanCard flight={flight} />);

    expect(container.querySelector('.wingman-point-name')?.textContent).toBe('WP1');
    expect(container.querySelector('.wingman-point-coordinate')?.textContent).not.toContain('DCS 座標');
    expect(buttonByText('前の点').getAttribute('aria-disabled')).toBe('true');
    expect(container.querySelector('.wingman-point-position')?.getAttribute('aria-live')).toBe('polite');

    await click(buttonByText('次の点'));

    expect(container.querySelector('.wingman-point-name')?.textContent).toBe('WP2');
    expect(container.querySelector('.wingman-point-position')?.textContent).toBe('2 / 2');
    expect(container.querySelector('.wingman-point-coordinate')?.textContent).toContain('未解決');
    expect(container.querySelector('.wingman-point-coordinate')?.textContent).toContain('DCS 座標 5000, 8000');
    expect(buttonByText('次の点').getAttribute('aria-disabled')).toBe('true');
    expect(buttonByText('前の点').getAttribute('aria-disabled')).toBe('false');

    // At the last point the end button stays focusable and a click does nothing.
    await click(buttonByText('次の点'));
    expect(container.querySelector('.wingman-point-position')?.textContent).toBe('2 / 2');
  });

  it('writes no time for a later point whose ETA is 0, and keeps the mission start on the first point', async () => {
    const flight = blueFlight();
    flight.route[1] = { ...flight.route[1], eta: 0 };
    writeWingmanSlot(SLOT);
    await render(makeMission([flight]), <WingmanCard flight={flight} />);

    const eta = () => Array.from(container.querySelectorAll('.wingman-point-facts > div'))
      .find(row => row.querySelector('dt')?.textContent === 'ETA')?.querySelector('dd')?.textContent;
    expect(eta()).toMatch(/\d\d:\d\d:\d\d/);
    await click(buttonByText('次の点'));
    expect(eta()).toBe('-');
  });

  it('shows the leg from each point to the next one, and says the last point has none (the route stores the leg on the arrival point)', async () => {
    const flight = blueFlight();
    writeWingmanSlot(SLOT);
    await render(makeMission([flight]), <WingmanCard flight={flight} />);

    // WP1 -> WP2 is stored on WP2 (its arrival leg): 5000 m, 90 s, true 90 / magnetic 85.
    const leg = () => container.querySelector('.wingman-point-leg')?.textContent ?? '';
    expect(leg()).toContain('01:30');
    expect(leg()).toContain('真 90° / 磁 85°');
    expect(leg()).not.toContain('最後の点です');
    expect(container.querySelector('.wingman-point-facts')?.textContent).toContain('気圧高度');

    await click(buttonByText('次の点'));
    expect(leg()).toContain('最後の点です');
    expect(leg()).not.toContain('01:30');
  });

  it('says the leg is unavailable when the next point has no leg, and does not call it the last point', async () => {
    const flight = blueFlight();
    flight.route = [flight.route[0], { ...flight.route[1], leg: undefined }];
    writeWingmanSlot(SLOT);
    await render(makeMission([flight]), <WingmanCard flight={flight} />);

    const leg = container.querySelector('.wingman-point-leg')?.textContent ?? '';
    expect(leg).toContain('区間を計算できません');
    expect(leg).not.toContain('最後の点です');
  });

  it('says so when the chosen aircraft has no radio presets', async () => {
    const flight = blueFlight();
    writeWingmanSlot({ ...SLOT, unitId: 12 });
    await render(makeMission([flight]), <WingmanCard flight={flight} />);

    expect(container.querySelector('.wingman-card-name')?.textContent).toContain('Enfield 1-2');
    expect(container.querySelectorAll('.wingman-radio')).toHaveLength(0);
    expect(container.textContent).toContain('無線の記録がありません');
  });

  it('renders nothing for a stale choice whose unit is no longer in the flight', async () => {
    const flight = blueFlight();
    writeWingmanSlot({ ...SLOT, unitId: 99 });
    await render(makeMission([flight]), <WingmanCard flight={flight} />);

    expect(container.innerHTML).toBe('');
  });

  it('moves the focus to the result line after a clear, because the card it was on is removed', async () => {
    const flight = blueFlight();
    writeWingmanSlot(SLOT);
    await render(makeMission([flight]), <WingmanCard flight={flight} />);

    await click(container.querySelector<HTMLButtonElement>('.wingman-clear') as HTMLButtonElement);

    const result = container.querySelector('.wingman-save-notice');
    expect(result?.textContent).toContain('自機の選択を外しました');
    expect(document.activeElement).toBe(result);
  });

  it('removes the choice when cleared, and says so when the browser refuses the removal', async () => {
    const flight = blueFlight();
    writeWingmanSlot(SLOT);
    await render(makeMission([flight]), <WingmanCard flight={flight} />);

    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    await click(container.querySelector<HTMLButtonElement>('.wingman-clear') as HTMLButtonElement);

    expect(container.querySelector('.wingman-card')).toBeNull();
    expect(container.querySelector('.wingman-save-notice')?.textContent).toContain('この端末で自機の選択を消せませんでした');
  });

  it('keeps a clear result on its own flight: another flight shows none, and coming back does not bring it back', async () => {
    const chosen = blueFlight();
    const other: Flight = { ...blueFlight(), groupId: 6, name: 'Other', callsign: 'Other', units: [{ ...leadUnit(), unitId: 31 }] };
    writeWingmanSlot(SLOT);
    await render(makeMission([chosen, other]), <WingmanCard flight={chosen} />);
    await click(container.querySelector<HTMLButtonElement>('.wingman-clear') as HTMLButtonElement);
    expect(container.querySelector('.wingman-save-notice')).not.toBeNull();

    // The same card instance (no remount, no key): another flight is shown, then the first one again.
    await render(makeMission([chosen, other]), <WingmanCard flight={other} />);
    expect(container.querySelector('.wingman-save-notice')).toBeNull();
    await render(makeMission([chosen, other]), <WingmanCard flight={chosen} />);
    expect(container.querySelector('.wingman-save-notice')).toBeNull();
  });

  it('opens the card by default on a phone width and leaves it closed on a wider screen (SPEC F4)', async () => {
    const flight = blueFlight();
    writeWingmanSlot(SLOT);
    stubPhoneWidth(true);
    await render(makeMission([flight]), <WingmanCard flight={flight} />);
    expect(container.querySelector('.wingman-card')?.hasAttribute('open')).toBe(true);

    await act(async () => root.unmount());
    root = createRoot(container);
    stubPhoneWidth(false);
    await render(makeMission([flight]), <WingmanCard flight={flight} />);
    expect(container.querySelector('.wingman-card')?.hasAttribute('open')).toBe(false);
    expect(container.querySelector('.wingman-card-name')?.textContent).toContain('Enfield 1-1');
  });

  it('shows the radio presets of the chosen aircraft', async () => {
    const flight = blueFlight();
    writeWingmanSlot(SLOT);
    await render(makeMission([flight]), <WingmanCard flight={flight} />);

    const radios = Array.from(container.querySelectorAll('.wingman-radio')).map(item => item.textContent ?? '');
    expect(radios).toHaveLength(2);
    expect(radios[0]).toContain('Guard');
    expect(radios[1]).toContain('262.500');
  });

  it('renders nothing for a choice made for another mission, and for a broken stored record', async () => {
    const flight = blueFlight();
    writeWingmanSlot({ ...SLOT, missionKey: 'mission-B' });
    await render(makeMission([flight]), <WingmanCard flight={flight} />);
    expect(container.innerHTML).toBe('');

    await act(async () => {
      localStorage.setItem(WINGMAN_STORAGE_KEY, '{broken');
      reloadWingmanSlot();
    });
    expect(container.innerHTML).toBe('');
  });

  it('never shows a choice that points at a flight of the other side in pilot view (D1)', async () => {
    const blue = blueFlight();
    const red = redFlight();
    writeWingmanSlot({ ...SLOT, flightKey: 'red:9', unitId: 21 });
    await render(makeMission([blue], [red]), <WingmanCard flight={red} />);

    expect(container.innerHTML).toBe('');
  });

  it('shows the chosen aircraft of the other side in creator view, so the pilot-view hiding is not vacuous', async () => {
    setCreatorViewSetting();
    const blue = blueFlight();
    const red = redFlight();
    writeWingmanSlot({ ...SLOT, flightKey: 'red:9', unitId: 21 });
    await render(makeMission([blue], [red]), <WingmanCard flight={red} />);

    expect(container.querySelector('.wingman-card')).not.toBeNull();
    expect(container.querySelector('.wingman-card-name')?.textContent).toContain('Bandit');
  });

  it('on another flight, names the chosen aircraft and opens its flight', async () => {
    setCreatorViewSetting();
    const blue = blueFlight();
    const red = redFlight();
    writeWingmanSlot(SLOT);
    await render(makeMission([blue], [red]), <WingmanCard flight={red} />);

    expect(container.querySelector('.wingman-elsewhere')?.textContent).toContain('Enfield 1-1');
    expect(container.querySelector('.wingman-card')).toBeNull();

    await click(buttonByText('自機のフライトを開く'));
    expect(observedFlightKey).toBe('blue:5');
  });
});
