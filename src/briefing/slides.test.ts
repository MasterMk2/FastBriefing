import { describe, expect, it } from 'vitest';
import type { Units } from '../shell/units';
import type { Flight, MissionData, RoutePoint, SMEACNotes, SupportAsset, AIGroup } from '../types/mission';
import {
  BRIEFING_ROWS_PER_SLIDE,
  buildBriefingSlides,
  isResolvedLatLon,
  taskTextFor,
  type BriefingSlideInput,
  type SlideCell,
} from './slides';

/** Translation stub: returns the key, so assertions read the key names. */
const t = (key: string) => key;

const units: Units = {
  alt: meters => `${meters}m`,
  speed: ms => `${ms}ms`,
  distance: meters => `${meters}dist`,
  pressure: () => 'P',
  temp: celsius => `${celsius}C`,
  coord: () => 'COORD',
  time: seconds => `T${seconds}`,
  wind: direction => `W${direction}`,
};

const EMPTY_SMEAC: SMEACNotes = {
  situation: '',
  mission: '',
  execution: '',
  adminLogistics: '',
  commandSignal: '',
};

function point(index: number, eta: number, resolved = true): RoutePoint {
  return {
    index,
    name: `WP${index}`,
    action: 'Turning Point',
    xy: [1000 * index, 2000 * index],
    latlon: resolved ? [42, 42 + index * 0.01] : [0, 0],
    latlonResolved: resolved,
    alt: 6000,
    altType: 'BARO',
    speed: 200,
    eta,
    tasks: [],
  };
}

function flight(groupId: number, callsign: string, route: RoutePoint[]): Flight {
  return {
    groupId,
    name: callsign,
    callsign,
    type: 'FA-18C_hornet',
    task: 'CAP',
    frequency: 251,
    modulation: 0,
    hidden: false,
    units: [{ unitId: 1 } as Flight['units'][number]],
    route,
  };
}

function support(kind: SupportAsset['kind'], callsign: string, resolved: boolean): SupportAsset {
  return {
    kind,
    callsign,
    hidden: false,
    frequency: 262,
    position: [5000, 6000],
    latlon: resolved ? [42, 43] : undefined,
    latlonResolved: resolved,
  } as SupportAsset;
}

function threatGroup(type: string, source: AIGroup['threatRangeSource'], range?: number): AIGroup {
  return {
    category: 'SAM',
    type,
    count: 1,
    position: [0, 0],
    threatRange: range,
    threatRangeSource: source,
    hidden: false,
    lateActivation: false,
    startTime: 0,
  } as AIGroup;
}

function makeMission(options: {
  blue?: Flight[];
  red?: Flight[];
  blueSupport?: SupportAsset[];
  blueThreats?: AIGroup[];
  redThreats?: AIGroup[];
} = {}): MissionData {
  const coalition = (flights: Flight[], supports: SupportAsset[] = [], threats: AIGroup[] = []) => ({
    bullseye: { xy: [0, 0] as [number, number], latlon: [42, 42] as [number, number], latlonResolved: true },
    navPoints: [],
    airbases: [],
    flights,
    support: supports,
    aiGroups: threats,
    zones: [],
    drawings: [],
  });
  return {
    sourceFingerprint: 'slides-fixture',
    meta: {
      sortie: 'Slides fixture',
      description: '',
      descriptionBlueTask: 'Blue task',
      descriptionRedTask: 'Red task',
      descriptionNeutralTask: 'Neutral task',
      theatre: 'Caucasus',
      date: { Year: 2026, Month: 1, Day: 1 },
      startTime: 0,
      utcOffset: 0,
      meVersion: 1,
      images: [],
    },
    weather: {
      temperature: 15,
      qnh: { mmHg: 760, hPa: 1013, inHg: 29.92 },
      wind: [{ level: 'ground', from: 90, to: 270, speed: 4 }],
      clouds: { preset: 'clear', label: 'Clear', base: 0 },
      visibility: 10000,
      fog: { thickness: 0, visibility: 0, enabled: false },
      dust: { density: 0, enabled: false },
      turbulence: { ground: 0 },
    },
    coalitions: {
      blue: coalition(options.blue ?? [], options.blueSupport ?? [], options.blueThreats ?? []),
      red: coalition(options.red ?? [], [], options.redThreats ?? []),
      neutral: coalition([]),
    },
    userNotes: {} as MissionData['userNotes'],
    issues: [],
  } as unknown as MissionData;
}

function input(
  mission: MissionData,
  overrides: Partial<BriefingSlideInput> & Pick<BriefingSlideInput, 'sections'>,
): BriefingSlideInput {
  return {
    view: mission,
    side: 'blue',
    viewMode: 'creator',
    notes: EMPTY_SMEAC,
    units,
    t,
    ...overrides,
  };
}

function cellsOfTable(slide: { table?: { rows: SlideCell[][] } }): SlideCell[][] {
  return slide.table?.rows ?? [];
}

describe('isResolvedLatLon', () => {
  it('treats the [0, 0] placeholder, a missing value and resolved false as unresolved', () => {
    expect(isResolvedLatLon([42, 42])).toBe(true);
    expect(isResolvedLatLon([0, 0])).toBe(false);
    expect(isResolvedLatLon([42, 42], false)).toBe(false);
    expect(isResolvedLatLon(undefined)).toBe(false);
    expect(isResolvedLatLon([Number.NaN, 42])).toBe(false);
    expect(isResolvedLatLon([95, 42])).toBe(false);
  });
});

describe('taskTextFor', () => {
  it('uses the own side text, then the neutral text, and never the other side', () => {
    const meta = makeMission().meta;
    expect(taskTextFor(meta, 'blue')).toBe('Blue task');
    expect(taskTextFor(meta, 'red')).toBe('Red task');
    expect(taskTextFor({ ...meta, descriptionBlueTask: '' }, 'blue')).toBe('Neutral task');
  });
});

describe('buildBriefingSlides (F8)', () => {
  it('builds sections in the fixed order whatever the order of the settings', () => {
    const mission = makeMission({ blue: [flight(1, 'Viper 1', [point(1, 600)])] });
    const slides = buildBriefingSlides(input(mission, {
      sections: new Set(['comms', 'overview', 'flights']),
    }));

    expect(slides.map(slide => slide.section)).toEqual(['overview', 'flights', 'comms']);
  });

  it('includes nothing for sections that are not selected', () => {
    const mission = makeMission({ blue: [flight(1, 'Viper 1', [point(1, 600)])] });
    expect(buildBriefingSlides(input(mission, { sections: new Set() }))).toEqual([]);
  });

  it('never builds the threats section in pilot view, even when it is selected', () => {
    const mission = makeMission({
      blue: [flight(1, 'Viper 1', [point(1, 600)])],
      blueThreats: [threatGroup('SA-10', 'reference', 40000)],
    });

    const pilot = buildBriefingSlides(input(mission, {
      viewMode: 'pilot',
      sections: new Set(['threats']),
    }));
    const creator = buildBriefingSlides(input(mission, {
      viewMode: 'creator',
      sections: new Set(['threats']),
    }));

    expect(pilot).toEqual([]);
    expect(creator.map(slide => slide.section)).toEqual(['threats']);
  });

  it('shows a threat range only when it was recorded as a reference, otherwise unrecorded', () => {
    const mission = makeMission({
      blueThreats: [
        threatGroup('SA-10', 'reference', 40000),
        threatGroup('SA-2', 'unknown'),
      ],
    });
    const [slide] = buildBriefingSlides(input(mission, { sections: new Set(['threats']) }));
    const rows = cellsOfTable(slide);

    expect(rows[0][3]).toBe('40000dist');
    expect(rows[1][3]).toBe('briefing:threats.unrecorded');
  });

  it('splits a long navlog into slides of at most 14 rows, one flight at a time', () => {
    const longRoute = Array.from({ length: 16 }, (_, index) => point(index, index * 60 + 60));
    const mission = makeMission({
      blue: [flight(1, 'Viper 1', longRoute), flight(2, 'Viper 2', [point(0, 60), point(1, 120)])],
    });

    const slides = buildBriefingSlides(input(mission, { sections: new Set(['route']) }));

    expect(BRIEFING_ROWS_PER_SLIDE).toBe(14);
    expect(slides.map(slide => cellsOfTable(slide).length)).toEqual([14, 2, 2]);
    expect(slides[1].title).toBe(`${slides[0].title}briefing:continued`);
    expect(slides[2].title).toBe('briefing:route.title');
  });

  it('draws unresolved navlog positions as unresolved cells, not as coordinates', () => {
    const mission = makeMission({
      blue: [flight(1, 'Viper 1', [point(0, 60, false), point(1, 120)])],
    });

    const [slide] = buildBriefingSlides(input(mission, { sections: new Set(['route']) }));
    const [first, second] = cellsOfTable(slide);

    expect(first[2]).toEqual({ unresolved: true, xy: [0, 0] });
    expect(second[2]).toBe('COORD');
  });

  it('shows the magnetic bearing of a leg with an unresolved end as unresolved, not as true-only', () => {
    const mission = makeMission({
      blue: [flight(1, 'Viper 1', [point(0, 60, false), point(1, 120), point(2, 180)])],
    });

    const [slide] = buildBriefingSlides(input(mission, { sections: new Set(['route']) }));
    const [, second, third] = cellsOfTable(slide);

    expect(second[7]).toEqual({ unresolved: true });
    expect(third[7]).not.toEqual({ unresolved: true });
    expect(String(third[7])).not.toContain('briefing:route.trueOnly');
  });

  it('marks unresolved support positions as unresolved', () => {
    const mission = makeMission({
      blue: [flight(1, 'Viper 1', [point(1, 600)])],
      blueSupport: [support('tanker', 'Shell 1', false), support('awacs', 'Overlord 1', true)],
    });

    const [slide] = buildBriefingSlides(input(mission, { sections: new Set(['support']) }));
    const [tanker, awacs] = cellsOfTable(slide);

    expect(tanker[4]).toEqual({ unresolved: true, xy: [5000, 6000] });
    expect(awacs[4]).toBe('COORD');
  });

  it('lists only the displayed side in pilot view, even if the view still holds the other side', () => {
    const mission = makeMission({
      blue: [flight(1, 'Viper 1', [point(1, 600)])],
      red: [flight(2, 'Bandit 1', [point(1, 600)])],
    });

    const [slide] = buildBriefingSlides(input(mission, {
      viewMode: 'pilot',
      sections: new Set(['flights']),
    }));

    expect(cellsOfTable(slide).map(row => row[1])).toEqual(['Viper 1']);
  });

  it('shows an empty-state slide when a list section has no rows', () => {
    const mission = makeMission();
    const [slide] = buildBriefingSlides(input(mission, { sections: new Set(['flights']) }));

    expect(slide.text).toBe('briefing:empty.flights');
    expect(slide.table).toBeUndefined();
  });

  it('skips empty SMEAC fields and keeps the others', () => {
    const mission = makeMission();
    const slides = buildBriefingSlides(input(mission, {
      sections: new Set(['notes']),
      notes: { ...EMPTY_SMEAC, mission: '  Strike the depot  ', commandSignal: 'Freq 251' },
    }));

    expect(slides.map(slide => slide.key)).toEqual(['notes-mission', 'notes-commandSignal']);
    expect(slides[0].text).toBe('Strike the depot');
  });

  it('builds the map slide for all flights, since the map cannot filter to one flight yet', () => {
    const mission = makeMission({ blue: [flight(7, 'Viper 7', [point(1, 600)])] });

    const [all] = buildBriefingSlides(input(mission, { sections: new Set(['map']) }));

    expect(all.map).toEqual({ caption: 'briefing:map.all' });
  });

  it('builds the weather slide with the wind table and a METAR line', () => {
    const mission = makeMission();
    const [slide] = buildBriefingSlides(input(mission, { sections: new Set(['weather']) }));

    expect(slide.pairs?.map(pair => pair.label)).toContain('briefing:weather.qnh');
    expect(slide.table?.rows).toEqual([['briefing:weather.windLevel.ground', 'W270', '4ms']]);
    expect(slide.text).toContain('briefing:weather.metar');
  });

  it('shows the channel of the lead radio on the flight frequency, and the TACAN of a support asset', () => {
    const lead = flight(1, 'Viper 1', [point(1, 600)]);
    lead.units = [{
      unitId: 1,
      radios: [
        { radio: 1, channel: 5, frequency: 251000000, modulation: 0, name: 'Main' },
        { radio: 2, channel: 9, frequency: 243000000, modulation: 0, name: 'Guard' },
      ],
    } as unknown as Flight['units'][number]];
    lead.frequency = 251;
    const mission = makeMission({
      blue: [lead],
      blueSupport: [{ ...support('tanker', 'Shell 1', true), tacan: { channel: '21', mode: 'X' } } as SupportAsset],
    });

    const [slide] = buildBriefingSlides(input(mission, { sections: new Set(['comms']) }));
    const [flightRow, supportRow] = cellsOfTable(slide);

    expect(flightRow[1]).toBe('R1 / CH5');
    expect(supportRow[1]).toBe('21X');
  });

  it('shows a dash for a flight whose frequency has no matching radio', () => {
    const lead = flight(1, 'Viper 1', [point(1, 600)]);
    lead.frequency = 262;
    const mission = makeMission({ blue: [lead] });

    const [slide] = buildBriefingSlides(input(mission, { sections: new Set(['comms']) }));

    expect(cellsOfTable(slide)[0][1]).toBe('—');
  });

  it('lists fog, dust and ground turbulence on the weather slide only when they are set or present', () => {
    const mission = makeMission();
    mission.weather.fog = { thickness: 300, visibility: 800, enabled: true };
    mission.weather.dust = { density: 0, enabled: false };
    mission.weather.turbulence = { ground: 0 };

    const [slide] = buildBriefingSlides(input(mission, { sections: new Set(['weather']) }));
    const labels = slide.pairs?.map(pair => pair.label) ?? [];

    expect(labels).toContain('briefing:weather.fog');
    expect(labels).not.toContain('briefing:weather.dust');
    expect(slide.pairs?.find(pair => pair.label === 'briefing:weather.groundTurbulence')?.value).toBe('briefing:weather.none');
  });
});
