import { describe, expect, it } from 'vitest';
import { etaMismatchPoints, lintMission, lintMissionForSide } from './lint';
import type { LintFinding } from '../types/lint';
import {
  makeAIGroup,
  makeAirbase,
  makeCoalition,
  makeFlight,
  makeMission,
  makeRoutePoint,
  makeSupport,
  makeUnit,
} from '../__tests__/testMission';
import { applyViewMode } from '../utils/viewMode';

const client = (overrides: Parameters<typeof makeUnit>[0] = {}) => makeUnit({ skill: 'Client', ...overrides });
const radio = (frequencyHz: number, modulation = 0) => ({ channel: 1, frequency: frequencyHz, modulation, name: 'Tac' });

function codes(findings: LintFinding[], code: string): LintFinding[] {
  return findings.filter(finding => finding.code === code);
}

/** A mission with one own-side client flight, so that L10 does not fire by accident. */
function baseCoalitions(extra: { blue?: Partial<ReturnType<typeof makeCoalition>>; red?: Partial<ReturnType<typeof makeCoalition>> } = {}) {
  return {
    blue: makeCoalition({ flights: [makeFlight({ groupId: 1, callsign: 'Viper 1-1', units: [client()] })], ...extra.blue }),
    red: makeCoalition({ flights: [makeFlight({ groupId: 2, callsign: 'Ford 1-1', units: [client({ unitId: 9 })] })], ...extra.red }),
  };
}

describe('lintMission L1 frequency overlap', () => {
  it('flags two different flights on the same frequency and modulation', () => {
    const findings = lintMission(makeMission({
      blue: makeCoalition({ flights: [
        makeFlight({ groupId: 1, callsign: 'Viper 1-1', units: [client({ radios: [radio(251000000)] })] }),
        makeFlight({ groupId: 2, callsign: 'Viper 2-1', units: [client({ unitId: 2, radios: [radio(251000000)] })] }),
      ] }),
      red: makeCoalition({ flights: [makeFlight({ groupId: 3, callsign: 'Ford 1-1', units: [client({ unitId: 9 })] })] }),
    }));

    const l1 = codes(findings, 'L1');
    expect(l1).toHaveLength(1);
    expect(l1[0]).toMatchObject({ severity: 'warning', side: 'blue', screen: 'comms', params: { frequency: '251.000', modulation: 'AM', count: 2 } });
  });

  it('flags a difference of 1 kHz and ignores 1.1 kHz', () => {
    const at1kHz = lintMission(makeMission({
      blue: makeCoalition({ flights: [
        makeFlight({ groupId: 1, units: [client({ radios: [radio(251000000)] })] }),
        makeFlight({ groupId: 2, callsign: 'Viper 2-1', units: [client({ unitId: 2, radios: [radio(251001000)] })] }),
      ] }),
      red: makeCoalition({ flights: [makeFlight({ groupId: 3, callsign: 'Ford 1-1', units: [client({ unitId: 9 })] })] }),
    }));
    const at1Point1kHz = lintMission(makeMission({
      blue: makeCoalition({ flights: [
        makeFlight({ groupId: 1, units: [client({ radios: [radio(251000000)] })] }),
        makeFlight({ groupId: 2, callsign: 'Viper 2-1', units: [client({ unitId: 2, radios: [radio(251001100)] })] }),
      ] }),
      red: makeCoalition({ flights: [makeFlight({ groupId: 3, callsign: 'Ford 1-1', units: [client({ unitId: 9 })] })] }),
    }));

    expect(codes(at1kHz, 'L1')).toHaveLength(1);
    expect(codes(at1Point1kHz, 'L1')).toHaveLength(0);
  });

  it('does not flag two wingmen of one flight that share a preset', () => {
    const findings = lintMission(makeMission({
      blue: makeCoalition({ flights: [makeFlight({ groupId: 1, units: [
        client({ unitId: 1, radios: [radio(251000000)] }),
        client({ unitId: 2, radios: [radio(251000000)] }),
      ] })] }),
      red: makeCoalition({ flights: [makeFlight({ groupId: 3, callsign: 'Ford 1-1', units: [client({ unitId: 9 })] })] }),
    }));

    expect(codes(findings, 'L1')).toHaveLength(0);
  });

  it('flags a support asset on the same frequency as a flight', () => {
    const findings = lintMission(makeMission({
      blue: makeCoalition({
        flights: [makeFlight({ groupId: 1, units: [client({ radios: [radio(305000000)] })] })],
        support: [makeSupport({ frequency: 305000000 })],
      }),
      red: makeCoalition({ flights: [makeFlight({ groupId: 3, callsign: 'Ford 1-1', units: [client({ unitId: 9 })] })] }),
    }));

    expect(codes(findings, 'L1')).toHaveLength(1);
  });
});

describe('lintMission L2 duplicate callsign', () => {
  it('flags the same callsign twice in one coalition, ignoring case and spaces', () => {
    const findings = lintMission(makeMission({
      blue: makeCoalition({ flights: [
        makeFlight({ groupId: 1, callsign: 'Viper 1-1' }),
        makeFlight({ groupId: 2, callsign: ' viper 1-1 ' }),
      ] }),
      red: makeCoalition({ flights: [makeFlight({ groupId: 3, callsign: 'Ford 1-1', units: [client({ unitId: 9 })] })] }),
    }));

    const l2 = codes(findings, 'L2');
    expect(l2).toHaveLength(1);
    expect(l2[0]).toMatchObject({ severity: 'error', side: 'blue', screen: 'flights', flightKey: 'blue:1' });
  });

  it('does not flag the same callsign on opposing sides', () => {
    const findings = lintMission(makeMission(baseCoalitions({
      red: { flights: [makeFlight({ groupId: 2, callsign: 'Viper 1-1', units: [client({ unitId: 9 })] })] },
    })));

    expect(codes(findings, 'L2')).toHaveLength(0);
  });
});

describe('lintMission L3 tanker without TACAN', () => {
  it('flags a tanker with no TACAN and points at its support row', () => {
    const findings = lintMission(makeMission({
      ...baseCoalitions(),
      blue: makeCoalition({
        flights: baseCoalitions().blue.flights,
        support: [makeSupport({ kind: 'tanker', callsign: 'Texaco', tacan: undefined })],
      }),
    }));

    const l3 = codes(findings, 'L3');
    expect(l3).toHaveLength(1);
    expect(l3[0]).toMatchObject({ severity: 'warning', screen: 'support', anchor: 'support:blue:0', params: { callsign: 'Texaco' } });
  });

  it('does not flag a tanker with a TACAN', () => {
    const findings = lintMission(makeMission({
      ...baseCoalitions(),
      blue: makeCoalition({
        flights: baseCoalitions().blue.flights,
        support: [makeSupport({ kind: 'tanker', tacan: { channel: '37', mode: 'X' } })],
      }),
    }));

    expect(codes(findings, 'L3')).toHaveLength(0);
  });
});

describe('lintMission L4 duplicate TACAN', () => {
  it('flags two support assets with the same channel and mode', () => {
    const findings = lintMission(makeMission({
      ...baseCoalitions(),
      blue: makeCoalition({
        flights: baseCoalitions().blue.flights,
        support: [
          makeSupport({ kind: 'tanker', callsign: 'Texaco', tacan: { channel: '37', mode: 'X' } }),
          makeSupport({ kind: 'awacs', callsign: 'Darkstar', tacan: { channel: '37', mode: 'X' } }),
        ],
      }),
    }));

    const l4 = codes(findings, 'L4');
    expect(l4).toHaveLength(1);
    expect(l4[0]).toMatchObject({ severity: 'warning', side: 'blue', params: { channel: '37', mode: 'X', count: 2 } });
  });

  it('does not flag the same channel with a different mode', () => {
    const findings = lintMission(makeMission({
      ...baseCoalitions(),
      blue: makeCoalition({
        flights: baseCoalitions().blue.flights,
        support: [
          makeSupport({ tacan: { channel: '37', mode: 'X' } }),
          makeSupport({ callsign: 'Darkstar', tacan: { channel: '37', mode: 'Y' } }),
        ],
      }),
    }));

    expect(codes(findings, 'L4')).toHaveLength(0);
  });
});

describe('lintMission L5 airbase owner', () => {
  const routeThrough = (airdromeId: number) => [
    makeRoutePoint({ index: 1, xy: [0, 0] }),
    makeRoutePoint({ index: 2, xy: [10000, 0], airdromeId, speed: 0, eta: 0 }),
  ];

  it('flags a route point at an airbase owned by the other side', () => {
    const findings = lintMission(makeMission({
      blue: makeCoalition({
        flights: [makeFlight({ groupId: 1, route: routeThrough(5), units: [client()] })],
      }),
      red: makeCoalition({
        flights: [makeFlight({ groupId: 2, callsign: 'Ford 1-1', units: [client({ unitId: 9 })] })],
        airbases: [makeAirbase({ id: 5, name: 'Kutaisi', owner: 'RED' })],
      }),
    }));

    const l5 = codes(findings, 'L5');
    expect(l5).toHaveLength(1);
    expect(l5[0]).toMatchObject({ severity: 'warning', side: 'blue', flightKey: 'blue:1', anchor: 'route:blue:1:2', params: { airbase: 'Kutaisi', owner: 'RED' } });
  });

  it('does not flag an airbase owned by the own side or NEUTRAL', () => {
    const findings = lintMission(makeMission({
      blue: makeCoalition({
        flights: [makeFlight({ groupId: 1, route: routeThrough(5), units: [client()] })],
        airbases: [makeAirbase({ id: 5, owner: 'BLUE' })],
      }),
      red: makeCoalition({
        flights: [makeFlight({ groupId: 2, callsign: 'Ford 1-1', units: [client({ unitId: 9 })] })],
        airbases: [makeAirbase({ id: 6, owner: 'NEUTRAL' })],
      }),
    }));

    expect(codes(findings, 'L5')).toHaveLength(0);
  });
});

describe('lintMission L6 ETA mismatch (info, method unverified)', () => {
  const route = (etaSecond: number) => [
    makeRoutePoint({ index: 1, xy: [0, 0], speed: 200, eta: 0 }),
    makeRoutePoint({ index: 2, xy: [10000, 0], speed: 200, eta: etaSecond }),
  ];

  it('flags a leg whose ETA difference is more than 30 s away from distance over speed', () => {
    // 10 km at 200 m/s is 50 s; an ETA of 100 s is 50 s off.
    expect(etaMismatchPoints(route(100))).toHaveLength(1);
    const findings = lintMission(makeMission({
      blue: makeCoalition({ flights: [makeFlight({ groupId: 1, route: route(100), units: [client()] })] }),
      red: makeCoalition({ flights: [makeFlight({ groupId: 2, callsign: 'Ford 1-1', units: [client({ unitId: 9 })] })] }),
    }));
    expect(codes(findings, 'L6')).toEqual([expect.objectContaining({ severity: 'info', flightKey: 'blue:1', anchor: 'route:blue:1:2' })]);
  });

  it('does not flag a leg that agrees with its ETA', () => {
    expect(etaMismatchPoints(route(50))).toEqual([]);
  });

  it('skips legs where the ETA is not set', () => {
    expect(etaMismatchPoints(route(0))).toEqual([]);
  });
});

describe('lintMission L7 unresolved positions (info)', () => {
  it('counts unresolved route points and unresolved support positions', () => {
    const findings = lintMission(makeMission({
      blue: makeCoalition({
        flights: [makeFlight({ groupId: 1, units: [client()], route: [
          makeRoutePoint({ index: 1, latlonResolved: false }),
          makeRoutePoint({ index: 2, latlonResolved: false }),
        ] })],
        support: [makeSupport({ latlonResolved: false, latlon: undefined })],
      }),
      red: makeCoalition({ flights: [makeFlight({ groupId: 2, callsign: 'Ford 1-1', units: [client({ unitId: 9 })] })] }),
    }));

    const l7 = codes(findings, 'L7');
    expect(l7).toEqual([
      expect.objectContaining({ severity: 'info', screen: 'flights', params: { count: 2 } }),
      expect.objectContaining({ severity: 'info', screen: 'support', params: { count: 1 } }),
    ]);
  });

  it('does not count resolved route points and support positions', () => {
    const findings = lintMission(makeMission({
      blue: makeCoalition({
        flights: [makeFlight({ groupId: 1, units: [client()], route: [makeRoutePoint({ index: 1 })] })],
        support: [makeSupport()],
      }),
      red: makeCoalition({ flights: [makeFlight({ groupId: 2, callsign: 'Ford 1-1', units: [client({ unitId: 9 })] })] }),
    }));

    expect(codes(findings, 'L7')).toHaveLength(0);
  });

  it('counts a support asset with no coordinates, even when latlonResolved is not false (as the screen shows it)', () => {
    const findings = lintMission(makeMission({
      ...baseCoalitions(),
      blue: makeCoalition({
        flights: baseCoalitions().blue.flights,
        support: [makeSupport({ latlonResolved: true, latlon: undefined })],
      }),
    }));

    expect(codes(findings, 'L7')).toEqual([expect.objectContaining({ screen: 'support', params: { count: 1 } })]);
  });
});

describe('lintMission L8 unrecorded threat ranges (info)', () => {
  it('counts ground groups whose range is unknown, without positions', () => {
    const findings = lintMission(makeMission({
      ...baseCoalitions(),
      red: makeCoalition({
        flights: baseCoalitions().red.flights,
        aiGroups: [makeAIGroup({ type: 'Mystery', threatRangeSource: 'unknown' })],
      }),
    }));

    expect(codes(findings, 'L8')).toEqual([expect.objectContaining({ severity: 'info', side: 'red', screen: 'threats', params: { count: 1 } })]);
  });

  it('does not report when every ground group has a recorded range', () => {
    const findings = lintMission(makeMission({
      ...baseCoalitions(),
      red: makeCoalition({
        flights: baseCoalitions().red.flights,
        aiGroups: [makeAIGroup({ type: 'SA-2', threatRange: 18000, threatRangeSource: 'reference' })],
      }),
    }));

    expect(codes(findings, 'L8')).toHaveLength(0);
  });

  it('counts unrecorded groups of the own side as well', () => {
    const findings = lintMission(makeMission({
      ...baseCoalitions(),
      blue: makeCoalition({
        flights: baseCoalitions().blue.flights,
        aiGroups: [makeAIGroup({ type: 'OwnMystery', threatRangeSource: 'unknown' })],
      }),
    }));

    expect(codes(findings, 'L8')).toEqual([expect.objectContaining({ side: 'blue', screen: 'threats', params: { count: 1 } })]);
  });
});

describe('lintMission L9 laser code', () => {
  it('flags a laser code that is not four digits', () => {
    const findings = lintMission(makeMission({
      ...baseCoalitions(),
      blue: makeCoalition({
        flights: baseCoalitions().blue.flights,
        support: [makeSupport({ kind: 'jtac', callsign: 'Hammer', laserCode: 16888 })],
      }),
    }));

    expect(codes(findings, 'L9')).toEqual([expect.objectContaining({ severity: 'warning', screen: 'support', params: { callsign: 'Hammer', code: '16888' } })]);
  });

  it('accepts four-digit codes, including a JTAC code', () => {
    const findings = lintMission(makeMission({
      ...baseCoalitions(),
      blue: makeCoalition({
        flights: baseCoalitions().blue.flights,
        support: [makeSupport({ kind: 'jtac', laserCode: 1688, jtac: { laserCode: '1113' } })],
      }),
    }));

    expect(codes(findings, 'L9')).toHaveLength(0);
  });
});

describe('lintMission L10 client count', () => {
  it('reports an error when the displayed side has no client flight', () => {
    const findings = lintMission(makeMission({
      blue: makeCoalition({ flights: [makeFlight({ groupId: 1, units: [makeUnit({ skill: 'AI' })] })] }),
      red: makeCoalition({ flights: [makeFlight({ groupId: 2, callsign: 'Ford 1-1', units: [makeUnit({ skill: 'AI', unitId: 9 })] })] }),
    }));

    expect(codes(findings, 'L10')).toEqual([expect.objectContaining({ severity: 'error', side: 'blue' })]);
  });

  it('uses the side that has flights when only one side has flights', () => {
    const findings = lintMission(makeMission({
      red: makeCoalition({ flights: [makeFlight({ groupId: 2, callsign: 'Ford 1-1', units: [makeUnit({ skill: 'AI' })] })] }),
    }));

    expect(codes(findings, 'L10')).toEqual([expect.objectContaining({ side: 'red' })]);
  });
});

describe('lintMissionForSide L10 uses the displayed side (D2)', () => {
  const aiOnlyBlue = () => makeCoalition({ flights: [makeFlight({ groupId: 1, callsign: 'Viper 1-1', units: [makeUnit({ skill: 'AI' })] })] });
  const clientRed = () => makeCoalition({ flights: [makeFlight({ groupId: 2, callsign: 'Ford 1-1', units: [client({ unitId: 9 })] })] });

  it('reports the displayed side when it has no client, even if the other side has one', () => {
    const findings = lintMissionForSide(makeMission({ blue: aiOnlyBlue(), red: clientRed() }), 'blue');

    expect(codes(findings, 'L10')).toEqual([expect.objectContaining({ severity: 'error', side: 'blue' })]);
  });

  it('reports nothing when the displayed side has a client, even if the other side has none', () => {
    const findings = lintMissionForSide(makeMission({ blue: aiOnlyBlue(), red: clientRed() }), 'red');

    expect(codes(findings, 'L10')).toHaveLength(0);
  });

  it('reports the displayed side in pilot view when it has no flights left after the view is made', () => {
    const mission = makeMission({
      blue: makeCoalition({ flights: [makeFlight({ groupId: 1, units: [client()] })] }),
      red: makeCoalition({ flights: [] }),
    });

    const findings = lintMissionForSide(applyViewMode(mission, 'pilot', 'red'), 'red');

    expect(codes(findings, 'L10')).toEqual([expect.objectContaining({ severity: 'error', side: 'red' })]);
  });

  it('checks the displayed side of a creator view (the view is the original mission)', () => {
    const mission = makeMission({
      blue: makeCoalition({ flights: [makeFlight({ groupId: 1, callsign: 'Viper 1-1', units: [client()] })] }),
      red: makeCoalition({ flights: [makeFlight({ groupId: 2, callsign: 'Ford 1-1', units: [makeUnit({ skill: 'AI' })] })] }),
    });
    const view = applyViewMode(mission, 'creator', 'red');

    expect(codes(lintMissionForSide(view, 'red'), 'L10')).toEqual([expect.objectContaining({ severity: 'error', side: 'red' })]);
    expect(codes(lintMissionForSide(view, 'blue'), 'L10')).toHaveLength(0);
  });

  it('reports the displayed side in pilot view when it has only AI flights and the other side has a client', () => {
    const mission = makeMission({
      blue: makeCoalition({ flights: [makeFlight({ groupId: 1, callsign: 'Viper 1-1', units: [client()] })] }),
      red: makeCoalition({ flights: [makeFlight({ groupId: 2, callsign: 'Ford 1-1', units: [makeUnit({ skill: 'AI' })] })] }),
    });

    const findings = lintMissionForSide(applyViewMode(mission, 'pilot', 'red'), 'red');

    expect(codes(findings, 'L10')).toEqual([expect.objectContaining({ severity: 'error', side: 'red' })]);
  });
});

describe('lintMissionForSide in pilot view (D1)', () => {
  it('shows no opposing-side finding and no opposing airbase, and keeps the own-side checks', () => {
    const mission = makeMission({
      blue: makeCoalition({
        flights: [makeFlight({
          groupId: 1,
          callsign: 'Viper 1-1',
          units: [client({ radios: [radio(251000000)] })],
          route: [
            makeRoutePoint({ index: 1, xy: [0, 0] }),
            makeRoutePoint({ index: 2, xy: [10000, 0], airdromeId: 5, speed: 0, eta: 0 }),
          ],
        })],
      }),
      red: makeCoalition({
        flights: [
          makeFlight({ groupId: 2, callsign: 'Ford 1-1', units: [client({ unitId: 9, radios: [radio(251000000)] })] }),
          makeFlight({ groupId: 3, callsign: 'Ford 2-1', units: [client({ unitId: 10, radios: [radio(251000000)] })] }),
        ],
        aiGroups: [makeAIGroup({ type: 'Mystery', threatRangeSource: 'unknown' })],
        airbases: [makeAirbase({ id: 5, name: 'Kutaisi', owner: 'RED' })],
      }),
    });

    const creator = lintMissionForSide(mission, 'blue');
    expect(codes(creator, 'L1').map(finding => finding.side)).toEqual(['red']);
    expect(codes(creator, 'L5')).toHaveLength(1);
    expect(codes(creator, 'L8').map(finding => finding.side)).toEqual(['red']);

    expect(lintMissionForSide(applyViewMode(mission, 'pilot', 'blue'), 'blue')).toEqual([]);
  });
});

describe('lintMissionForSide threat findings by view mode (D1)', () => {
  it('keeps the L8 finding in creator view and returns no threat finding in pilot view', () => {
    const mission = makeMission({
      ...baseCoalitions(),
      red: makeCoalition({
        flights: baseCoalitions().red.flights,
        aiGroups: [makeAIGroup({ type: 'Mystery', threatRangeSource: 'unknown' })],
      }),
    });

    expect(codes(lintMissionForSide(mission, 'blue', 'creator'), 'L8')).toHaveLength(1);
    expect(lintMissionForSide(mission, 'blue', 'pilot').filter(finding => finding.screen === 'threats')).toEqual([]);
  });
});

describe('lintMission anchors (the targets of "この箇所へ")', () => {
  it('anchors L1 at its conflict, using the same anchor as the comms screen', () => {
    const findings = lintMission(makeMission({
      blue: makeCoalition({ flights: [
        makeFlight({ groupId: 1, callsign: 'Viper 1-1', units: [client({ radios: [radio(251000000)] })] }),
        makeFlight({ groupId: 2, callsign: 'Viper 2-1', units: [client({ unitId: 2, radios: [radio(251000000)] })] }),
      ] }),
      red: makeCoalition({ flights: [makeFlight({ groupId: 3, callsign: 'Ford 1-1', units: [client({ unitId: 9 })] })] }),
    }));

    expect(codes(findings, 'L1')).toEqual([expect.objectContaining({ screen: 'comms', anchor: 'comms:conflict:AM:251.000' })]);
  });

  it('anchors L7 at the first unresolved route point and the first unresolved support asset', () => {
    const findings = lintMission(makeMission({
      ...baseCoalitions(),
      blue: makeCoalition({
        flights: [makeFlight({ groupId: 1, units: [client()], route: [
          makeRoutePoint({ index: 1 }),
          makeRoutePoint({ index: 2, latlonResolved: false }),
        ] })],
        support: [
          makeSupport(),
          makeSupport({ kind: 'awacs', callsign: 'Darkstar', latlonResolved: false, latlon: undefined }),
        ],
      }),
    }));

    expect(codes(findings, 'L7')).toEqual([
      expect.objectContaining({ screen: 'flights', flightKey: 'blue:1', anchor: 'route:blue:1:2', params: { count: 1 } }),
      expect.objectContaining({ screen: 'support', anchor: 'support:blue:1', params: { count: 1 } }),
    ]);
  });

  it('anchors L8 at the first unrecorded group of its side', () => {
    const findings = lintMission(makeMission({
      ...baseCoalitions(),
      red: makeCoalition({
        flights: baseCoalitions().red.flights,
        aiGroups: [
          makeAIGroup({ type: 'SA-2', threatRange: 18000, threatRangeSource: 'reference' }),
          makeAIGroup({ type: 'Mystery', threatRangeSource: 'unknown' }),
        ],
      }),
    }));

    expect(codes(findings, 'L8')).toEqual([expect.objectContaining({ side: 'red', anchor: 'threats:red:1' })]);
  });
});

describe('lintMission L4 and L5 edge cases', () => {
  it('reports a TACAN shared by the two coalitions as neutral', () => {
    const findings = lintMission(makeMission({
      blue: makeCoalition({
        flights: baseCoalitions().blue.flights,
        support: [makeSupport({ kind: 'tanker', callsign: 'Texaco', tacan: { channel: '37', mode: 'X' } })],
      }),
      red: makeCoalition({
        flights: baseCoalitions().red.flights,
        support: [makeSupport({ kind: 'awacs', callsign: 'Darkstar', tacan: { channel: '37', mode: 'X' } })],
      }),
    }));

    expect(codes(findings, 'L4')).toEqual([expect.objectContaining({ severity: 'warning', side: 'neutral', params: { channel: '37', mode: 'X', count: 2 } })]);
  });

  it('compares the airbase owner case-insensitively, so a lower-case owner of the other side is flagged', () => {
    const findings = lintMission(makeMission({
      blue: makeCoalition({
        flights: [makeFlight({ groupId: 1, route: [
          makeRoutePoint({ index: 1, xy: [0, 0] }),
          makeRoutePoint({ index: 2, xy: [10000, 0], airdromeId: 5, speed: 0, eta: 0 }),
        ], units: [client()] })],
      }),
      red: makeCoalition({
        flights: baseCoalitions().red.flights,
        airbases: [makeAirbase({ id: 5, name: 'Kutaisi', owner: 'red' })],
      }),
    }));

    expect(codes(findings, 'L5')).toEqual([expect.objectContaining({ side: 'blue', params: { airbase: 'Kutaisi', owner: 'RED' } })]);
  });
});

describe('lintMission ordering and clean missions', () => {
  it('sorts error, warning, then info', () => {
    const findings = lintMission(makeMission({
      blue: makeCoalition({
        flights: [
          makeFlight({ groupId: 1, callsign: 'Viper 1-1', units: [client()], route: [makeRoutePoint({ index: 1, latlonResolved: false })] }),
          makeFlight({ groupId: 2, callsign: 'Viper 1-1', units: [client({ unitId: 2 })] }),
        ],
      }),
      red: makeCoalition({ flights: [makeFlight({ groupId: 3, callsign: 'Ford 1-1', units: [client({ unitId: 9 })] })] }),
    }));

    const rank: Record<LintFinding['severity'], number> = { error: 0, warning: 1, info: 2 };
    const severities = findings.map(finding => finding.severity);
    expect(severities).toContain('error');
    expect(severities).toContain('info');
    expect(severities).toEqual([...severities].sort((a, b) => rank[a] - rank[b]));
  });

  it('returns no findings for a clean mission', () => {
    expect(lintMission(makeMission(baseCoalitions()))).toEqual([]);
  });
});
