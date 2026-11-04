import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../hooks/useSettings';
import type { DisplaySettings, MissionData, SupportAsset, Unit } from '../types/mission';
import type { KneeboardPage, KneeboardTranslate } from '../utils/kneeboard';
import { applyViewMode } from '../utils/viewMode';
import { buildExportModel } from './exportModel';
import { alignedTableLines, displayWidth, renderMarkdown } from './markdown';
import { fixtureMission } from './__tests__/fixture';

/** Keeps the option values in the text, so a test can see which time or wind form was chosen. */
const t: KneeboardTranslate = (key, options) => `${key}${options ? JSON.stringify(options) : ''}`;

function pagesWith(settings: Partial<DisplaySettings>, mutate?: (view: MissionData) => void): KneeboardPage[] {
  const view = applyViewMode(fixtureMission(), 'creator', 'blue');
  mutate?.(view);
  return buildExportModel({
    view,
    settings: { ...DEFAULT_SETTINGS, viewMode: 'creator', ...settings },
    side: 'blue',
    scope: { kind: 'mission' },
    whiteboard: { notes: '', strokes: [] },
  }, t).pages;
}

function textLines(pages: KneeboardPage[], section: string): string[] {
  return pages.flatMap(page => (page.kind === 'text' && page.section === section
    ? page.sections.flatMap(item => item.lines)
    : []));
}

describe('export output follows the time display (D6, decision 6)', () => {
  const sections = { briefingSections: ['overview'] as DisplaySettings['briefingSections'] };

  it('shows only the Zulu start time when the time display is Zulu', () => {
    const lines = textLines(pagesWith({ ...sections, timeDisplay: 'zulu' }), 'overview');
    expect(lines.some(line => line.startsWith('export:label.startZulu'))).toBe(true);
    expect(lines.some(line => line.startsWith('export:label.startLocal'))).toBe(false);
  });

  it('shows only the local start time when the time display is local', () => {
    const lines = textLines(pagesWith({ ...sections, timeDisplay: 'local' }), 'overview');
    expect(lines.some(line => line.startsWith('export:label.startLocal'))).toBe(true);
    expect(lines.some(line => line.startsWith('export:label.startZulu'))).toBe(false);
  });

  it('shows both start times when the time display is both', () => {
    const lines = textLines(pagesWith({ ...sections, timeDisplay: 'both' }), 'overview');
    expect(lines.some(line => line.startsWith('export:label.startLocal'))).toBe(true);
    expect(lines.some(line => line.startsWith('export:label.startZulu'))).toBe(true);
  });
});

describe('export output follows the wind display (D5, decision 6)', () => {
  const windMission = (view: MissionData) => {
    view.weather.wind = [{ level: 'ground', from: 270, to: 90, speed: 5 }];
  };

  it('writes only the direction the wind comes from when the wind display is from', () => {
    const lines = textLines(pagesWith({ briefingSections: ['weather'], windDisplay: 'from' }, windMission), 'weather');
    const wind = lines.find(line => line.startsWith('export:label.wind '));
    expect(wind).toContain('export:label.windFrom{"deg":270}');
    expect(wind).not.toContain('export:label.windBoth');
  });

  it('writes only the direction the wind blows toward when the wind display is to', () => {
    const lines = textLines(pagesWith({ briefingSections: ['weather'], windDisplay: 'to' }, windMission), 'weather');
    const wind = lines.find(line => line.startsWith('export:label.wind '));
    expect(wind).toContain('export:label.windTo{"deg":90}');
    expect(wind).not.toContain('export:label.windBoth');
  });
});

describe('neutral support is not exported (decision 11)', () => {
  const support = (callsign: string) => ({
    kind: 'tanker', callsign, hidden: false, frequency: 251_000_000, position: [1, 2],
  }) as unknown as SupportAsset;

  it('leaves neutral support off the comms, support and map pages, and keeps blue and red support', () => {
    const pages = pagesWith({ briefingSections: ['comms', 'support', 'map'] }, view => {
      view.coalitions.blue.support = [support('BlueTanker')];
      view.coalitions.red.support = [support('RedTanker')];
      view.coalitions.neutral.support = [support('NeutralTanker')];
    });
    const content = JSON.stringify(pages);
    expect(content).toContain('BlueTanker');
    expect(content).toContain('RedTanker');
    expect(content).not.toContain('NeutralTanker');
  });
});

describe('export map pages follow the basemap setting (decision 6)', () => {
  it('marks every map page as not wanting a basemap when the setting is off', () => {
    const maps = pagesWith({ briefingSections: ['map'], mapBackground: false }).filter(page => page.kind === 'map');
    expect(maps.length).toBeGreaterThan(0);
    for (const page of maps) {
      expect(page.kind === 'map' && page.scene.basemap).toBe(false);
    }
  });

  it('marks every map page as wanting a basemap when the setting is on', () => {
    const maps = pagesWith({ briefingSections: ['map'], mapBackground: true }).filter(page => page.kind === 'map');
    expect(maps.length).toBeGreaterThan(0);
    for (const page of maps) {
      expect(page.kind === 'map' && page.scene.basemap).toBe(true);
    }
  });
});

describe('the overview date follows the time display (PE-6, D6)', () => {
  // The fixture starts at 01:00 local on 2026-09-21 with UTC+3, so the Zulu date is 2026-09-20.
  const dateLine = (timeDisplay: DisplaySettings['timeDisplay']) => textLines(
    pagesWith({ briefingSections: ['overview'], timeDisplay }), 'overview',
  ).find(line => line.startsWith('export:label.date'));

  it('writes the Zulu date when the time display is Zulu', () => {
    expect(dateLine('zulu')).toBe('export:label.date: 2026-09-20Z');
  });

  it('writes the local date when the time display is local', () => {
    expect(dateLine('local')).toBe('export:label.date: 2026-09-21');
  });

  it('writes both dates when they differ and the time display is both', () => {
    expect(dateLine('both')).toBe('export:label.date: 2026-09-21 / 2026-09-20Z');
  });
});

describe('the PNG nav log has its labels (PE-8)', () => {
  it('writes every route point as labelled lines, not as cells joined with bars', () => {
    const pages = pagesWith({ briefingSections: ['route'] });
    const route = pages.find(page => page.kind === 'text' && page.section === 'route');
    const section = route?.kind === 'text' ? route.sections[0] : undefined;
    expect(section?.table?.header).toContain('export:label.coordinate');
    expect(section?.lines.some(line => line.includes(' | '))).toBe(false);
    for (const label of ['export:label.coordinate', 'export:label.altitude', 'export:label.speed', 'export:label.eta', 'export:label.legDistance', 'export:label.bearing']) {
      expect(section?.lines.some(line => line.includes(`${label}: `)), label).toBe(true);
    }
  });
});

describe('the nav log writes no time for a later point whose ETA is 0', () => {
  it('keeps the mission start on the first point and leaves the unset ones out, in the table and the PNG lines', () => {
    const pages = pagesWith({ briefingSections: ['route'], timeDisplay: 'zulu' }, view => {
      const [first] = view.coalitions.blue.flights[0].route;
      view.coalitions.blue.flights[0].route = [
        { ...first, index: 1, name: 'START', eta: 0 },
        { ...first, index: 2, name: 'PUSH', eta: 0 },
        { ...first, index: 3, name: 'TARGET', eta: 1800 },
      ];
    });
    const route = pages.find(page => page.kind === 'text' && page.section === 'route');
    const section = route?.kind === 'text' ? route.sections[0] : undefined;
    const etaColumn = section?.table?.header.indexOf('export:label.eta') ?? -1;
    const etas = section?.table?.rows.map(row => row[etaColumn]) ?? [];
    expect(etas[0]).toMatch(/^\d\d:\d\d:\d\dZ$/);
    expect(etas[1]).toBe('-');
    expect(etas[2]).toMatch(/^\d\d:\d\d:\d\dZ$/);
    expect(etas[2]).not.toBe(etas[0]);
    expect(section?.lines.filter(line => line.includes('export:label.eta: '))).toEqual(etas.map(eta => `  export:label.eta: ${eta}`));
  });
});

describe('the flight pages carry the lineup (TI-4)', () => {
  const lead: Unit = {
    unitId: 11,
    name: 'Viper 1-1',
    tailNumber: '401',
    skill: 'Client',
    livery: 'jasdf',
    payload: {
      pylons: [
        { station: '3', clsid: '{AIM-120C}', name: 'AIM-120C', count: 1, weight: 0 },
        { station: '1', clsid: '{ZZZ}', name: 'ZZZ', unknown: true, count: 1, weight: 0 },
      ],
      fuel: 3200, chaff: 60, flare: 30, gun: 510, weight: 0,
    },
    radios: [],
    props: { STN_L16: '00201' },
    datalink: { link16: { flightLead: true, team: 2 } },
  } as unknown as Unit;
  const withLead = (view: MissionData) => {
    view.coalitions.blue.flights[0].units = [lead, { ...lead, unitId: 12, name: 'Viper 1-2', tailNumber: '402' }];
  };

  it('lists the lead loadout in station order, every aircraft, and the Link16 setting', () => {
    const lines = textLines(pagesWith({ briefingSections: ['flights'] }, withLead), 'flights');
    const text = lines.join('\n');
    expect(lines.indexOf('1: export:label.unknownWeapon{"name":"ZZZ"} ×1')).toBeGreaterThanOrEqual(0);
    expect(lines.indexOf('1: export:label.unknownWeapon{"name":"ZZZ"} ×1')).toBeLessThan(lines.indexOf('3: AIM-120C ×1'));
    expect(text).toContain('export:label.tailNumber: 402');
    expect(text).toContain('export:label.fuelKg: 3200');
    expect(text).toContain('export:label.countermeasures: 60 / 30');
    expect(text).toContain('export:label.link16Value');
  });

  it('gives the print and Markdown a loadout table', () => {
    const pages = pagesWith({ briefingSections: ['flights'] }, withLead);
    const flights = pages.find(page => page.kind === 'text' && page.section === 'flights');
    const tables = flights?.kind === 'text' ? flights.sections.flatMap(section => (section.table ? [section.table] : [])) : [];
    expect(tables.some(table => table.header.includes('export:label.weapon') && table.rows.some(row => row.includes('AIM-120C')))).toBe(true);
  });
});

describe('weather and sun in the output (TI-5)', () => {
  it('writes fog, dust and ground turbulence on the weather page', () => {
    const lines = textLines(pagesWith({ briefingSections: ['weather'] }, view => {
      view.weather.fog = { thickness: 300, visibility: 800, enabled: true };
      view.weather.dust = { density: 2, enabled: true };
      view.weather.turbulence = { ground: 3 };
    }), 'weather');
    expect(lines.some(line => line.startsWith('export:label.fog: '))).toBe(true);
    expect(lines.some(line => line.startsWith('export:label.dust: '))).toBe(true);
    expect(lines.some(line => line.startsWith('export:label.groundTurbulence: '))).toBe(true);
  });

  it('writes the own bullseye with sunrise, sunset, twilight and moon age on the overview', () => {
    const lines = textLines(pagesWith({ briefingSections: ['overview'] }, view => {
      view.coalitions.blue.bullseye = { xy: [0, 0], latlon: [42, 43], latlonResolved: true };
    }), 'overview');
    for (const label of ['bullseye', 'sunrise', 'sunset', 'civilTwilight', 'nauticalTwilight', 'moonAge']) {
      expect(lines.some(line => line.startsWith(`export:label.${label}: `)), label).toBe(true);
    }
  });
});

describe('Markdown code blocks line the table columns up (PE-7)', () => {
  it('pads every cell to its column width, counting wide characters as two', () => {
    const lines = alignedTableLines(['No', '名前', 'Alt'], [['1', '離陸', '300 m'], ['12', 'IP-LONGNAME', '6000 m']]);
    // The last column starts where the line minus its last cell ends; it is the same on every line when aligned.
    const starts = lines.map(line => {
      const cells = line.split(/ {2,}/);
      return displayWidth(line) - displayWidth(cells[cells.length - 1]);
    });
    expect(new Set(starts).size).toBe(1);
    expect(displayWidth('名前')).toBe(4);
  });

  it('uses the aligned lines in the code style output', () => {
    const pages = pagesWith({ briefingSections: ['route'] });
    const markdown = renderMarkdown(pages, { title: 'T', viewLabel: 'V', style: 'code' }, t);
    expect(markdown).toContain('export:label.navNo  export:label.name');
  });
});
