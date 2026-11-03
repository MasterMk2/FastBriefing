import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../hooks/useSettings';
import type { DisplaySettings, Flight, MissionData } from '../types/mission';
import type { KneeboardPage } from '../utils/kneeboard';
import { applyViewMode } from '../utils/viewMode';
import { buildExportModel } from './exportModel';
import type { ExportScope } from './exportPlan';
import { renderMarkdown } from './markdown';
import { fixtureMission } from './__tests__/fixture';

/**
 * The behaviour of the old outputs (briefingMarkdown, planKneeboardPages, briefingPng) carried over to the
 * one output path (planExportPages → Markdown, print, PNG). Each describe names the old test it replaces.
 */

// Identity translator, except that the options stay visible (a title with a page number, for example).
const t = (key: string, options?: Record<string, string | number>) => (options ? `${key}${JSON.stringify(options)}` : key);

const creator: DisplaySettings = { ...DEFAULT_SETTINGS, viewMode: 'creator', side: 'blue' };
const pilot: DisplaySettings = { ...creator, viewMode: 'pilot' };

function pagesFor(
  settings: DisplaySettings,
  sections: DisplaySettings['briefingSections'],
  mutate?: (mission: MissionData) => void,
  scope: ExportScope = { kind: 'mission' },
  whiteboard = { notes: 'Board text', strokes: [] },
): KneeboardPage[] {
  const mission = fixtureMission();
  mutate?.(mission);
  const view = applyViewMode(mission, settings.viewMode, 'blue');
  return buildExportModel({
    view,
    settings: { ...settings, briefingSections: sections },
    side: 'blue',
    scope,
    whiteboard,
  }, t).pages;
}

function markdownOf(pages: KneeboardPage[], style: 'table' | 'code' = 'table'): string {
  return renderMarkdown(pages, { title: 'Export Test', viewLabel: 'view', style }, t);
}

function withPins(mission: MissionData) {
  mission.userNotes.mapAnnotations = [
    { id: 'pin_1', kind: 'pin', position: [42, 43], label: 'Rally', notes: 'Orbit west', color: '#e53935' },
    { id: 'pin_2', kind: 'pin', position: [42.1, 43.1], label: 'Tanker *track*', notes: '', color: '#1e88e5' },
    { id: 'line_1', kind: 'stroke', points: [[42, 43], [42.2, 43.2]], color: '#e53935', width: 4 },
  ];
}

function extraFlights(mission: MissionData, count: number) {
  const base = mission.coalitions.blue.flights[0];
  mission.coalitions.blue.flights.push(...Array.from({ length: count }, (_, index) => ({
    ...base,
    groupId: 10 + index,
    name: `Extra ${index + 1}`,
    callsign: `Extra ${index + 1}`,
  } as Flight)));
}

describe('map pins in Markdown and on the map page (old briefingMarkdown "map pin notes")', () => {
  it('lists every pin with its label and memo in the old "**label**: memo" form, and no line strokes', () => {
    const markdown = markdownOf(pagesFor(creator, ['map'], withPins));
    expect(markdown).toContain('### export:label.mapPins');
    expect(markdown).toContain('- **Rally**: Orbit west');
    // A pin without a memo says so; Markdown characters in the label are escaped.
    expect(markdown).toContain('- **Tanker \\*track\\***: export:label.notAvailable');
    expect(markdown.match(/^- \*\*/gm)).toHaveLength(2);
  });

  it('writes the pins as "label: memo" inside a fenced block in code style', () => {
    const markdown = markdownOf(pagesFor(creator, ['map'], withPins), 'code');
    expect(markdown).toContain('```text\nRally: Orbit west\nTanker *track*\n```');
  });

  it('lists the pins in pilot view too: annotations have no side and no hidden flag (D1 has nothing to drop)', () => {
    const pages = pagesFor(pilot, ['map'], withPins);
    const map = pages.find(page => page.kind === 'map');
    expect(map?.kind === 'map' && map.pins).toEqual([
      { label: 'Rally', notes: 'Orbit west' },
      { label: 'Tanker *track*', notes: '' },
    ]);
    expect(JSON.stringify(pages)).not.toContain('Bandit 1');
  });

  it('puts the pin list on the first map page only when the flights need several map pages', () => {
    const maps = pagesFor(creator, ['map'], mission => {
      withPins(mission);
      extraFlights(mission, 4);
    }).filter(page => page.kind === 'map');
    expect(maps).toHaveLength(2);
    expect(maps.map(page => (page.kind === 'map' ? page.pins.length : -1))).toEqual([2, 0]);
    expect(markdownOf(maps).match(/- \*\*Rally\*\*/g)).toHaveLength(1);
  });

  it('keeps the pins as text on the map page of a theatre that has no map', () => {
    const pages = pagesFor(creator, ['map'], mission => {
      withPins(mission);
      mission.meta.theatre = 'NoSuchTheatre';
    });
    expect(pages.map(page => page.kind)).toEqual(['text']);
    const markdown = markdownOf(pages);
    expect(markdown).toContain('### export:label.mapPins');
    expect(markdown).toContain('- Rally: Orbit west');
  });

  it('writes no pin heading when the map has no pins', () => {
    expect(markdownOf(pagesFor(creator, ['map']))).not.toContain('export:label.mapPins');
  });
});

describe('Markdown follows the selected sections and their order (old briefingMarkdown "planner order")', () => {
  it('writes only the selected sections, in the plan order, with the whiteboard between notes and map', () => {
    const markdown = markdownOf(pagesFor(creator, ['notes', 'map']));
    const notes = markdown.indexOf('## export:sections.notes');
    const whiteboard = markdown.indexOf('## export:label.whiteboard');
    const map = markdown.indexOf('## export:sections.map');
    expect(notes).toBeGreaterThan(0);
    expect(whiteboard).toBeGreaterThan(notes);
    expect(map).toBeGreaterThan(whiteboard);
    expect(markdown).toContain('Board text');
    expect(markdown).not.toContain('## export:sections.flights');
    expect(markdown).not.toContain('## export:sections.route');
  });

  it('keeps the plan order for every page family (old kneeboard "planner selection and order")', () => {
    const pages = pagesFor(creator, ['notes', 'map', 'overview']);
    expect(pages.map(page => page.section)).toEqual(['notes', 'notes', 'map', 'overview']);
    expect(pages.map(page => page.kind)).toEqual(['text', 'whiteboard', 'map', 'text']);
  });
});

describe('waypoint purpose and memo (old kneeboard and briefingMarkdown waypoint tests)', () => {
  const annotated = (mission: MissionData) => {
    mission.userNotes.waypoints['blue:1:0'] = { purpose: 'Attack IP', notes: '15,000 ft' };
  };

  it('puts the purpose and memo under the nav log table of the route page', () => {
    const pages = pagesFor(creator, ['route'], annotated, { kind: 'flights', flightKeys: ['blue:1'] });
    const route = pages.find(page => page.kind === 'text' && page.section === 'route');
    const notes = route?.kind === 'text' ? route.sections.find(section => section.heading === 'export:label.notesLabel') : undefined;
    expect(notes?.lines).toEqual(['1. Attack IP / 15,000 ft']);
  });

  it('writes the purpose and memo into the Markdown nav log', () => {
    const markdown = markdownOf(pagesFor(creator, ['route'], annotated, { kind: 'flights', flightKeys: ['blue:1'] }));
    expect(markdown).toContain('- 1. Attack IP / 15,000 ft');
  });
});

describe('hidden flights and the pilot view (old kneeboard "filtering hidden flights" and D1)', () => {
  const hiddenData = (mission: MissionData) => {
    mission.userNotes.perFlight['blue:2'] = { pilotName: 'Ghost', tot: '', jokerFuel: null, bingoFuel: null, customNotes: 'Hidden memo' };
    mission.userNotes.waypoints['blue:2:0'] = { purpose: 'Hidden purpose', notes: '' };
    mission.coalitions.blue.flights[1].units = [{ radios: [{ channel: 1, frequency: 251, modulation: 0, name: 'Hidden radio' }] }] as unknown as Flight['units'];
  };

  it('keeps hidden flights out of the notes, nav log and comms pages in pilot view', () => {
    const pages = pagesFor(pilot, ['notes', 'flights', 'route', 'comms'], hiddenData);
    const text = JSON.stringify(pages);
    expect(text).toContain('Situation text');
    expect(text).toContain('Viper 1');
    for (const secret of ['Hidden 1', 'Ghost', 'Hidden memo', 'Hidden purpose', 'Hidden radio', 'Bandit 1', 'Secret pilot']) {
      expect(text).not.toContain(secret);
    }
  });

  it('keeps hidden flights in creator view, which shows every item (applyViewMode)', () => {
    const text = JSON.stringify(pagesFor(creator, ['notes', 'route', 'comms'], hiddenData));
    expect(text).toContain('Hidden memo');
    expect(text).toContain('Hidden radio');
  });

  it('limits every page to the flights of one aircraft type', () => {
    const text = JSON.stringify(pagesFor(creator, ['flights', 'route', 'comms'], undefined, { kind: 'aircraft', aircraftType: 'MiG-29S' }));
    expect(text).toContain('Bandit 1');
    expect(text).not.toContain('Viper 1');
  });
});

describe('map pages split so every flight has a legend entry (old kneeboard "splits maps")', () => {
  it('puts at most four flights on one map page and numbers the pages', () => {
    const maps = pagesFor(pilot, ['map'], mission => extraFlights(mission, 4)).filter(page => page.kind === 'map');
    expect(maps.map(page => page.title)).toEqual([
      'export:sections.map 1/2',
      'export:sections.map 2/2',
    ]);
    expect(maps.flatMap(page => (page.kind === 'map' ? page.scene.routes.map(route => route.label) : []))).toEqual([
      'Viper 1', 'Extra 1', 'Extra 2', 'Extra 3', 'Extra 4',
    ]);
  });
});
