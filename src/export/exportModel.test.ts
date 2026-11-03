import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../hooks/useSettings';
import type { DisplaySettings } from '../types/mission';
import { applyViewMode } from '../utils/viewMode';
import { buildExportModel, kneeboardMizName, kneeboardZipName, normalizedMissionJson, safeFileStem, selectExportFlights } from './exportModel';
import { buildExportPlan, readExportScope, setExportScope, resetExportScope } from './exportPlan';
import { fixtureMission } from './__tests__/fixture';
import { renderMarkdown } from './markdown';

// Identity translator: every label is its key, so tests can check which label was used.
const t = (key: string) => key;

const creator: DisplaySettings = {
  ...DEFAULT_SETTINGS,
  viewMode: 'creator',
  side: 'blue',
  briefingSections: ['overview', 'weather', 'flights', 'route', 'comms', 'support', 'threats', 'notes'],
};
const pilot: DisplaySettings = { ...creator, viewMode: 'pilot' };

function modelFor(settings: DisplaySettings, scope: Parameters<typeof buildExportPlan>[1] = { kind: 'mission' }) {
  const mission = fixtureMission();
  const view = applyViewMode(mission, settings.viewMode, 'blue');
  return buildExportModel({
    view,
    settings,
    side: 'blue',
    scope,
    whiteboard: { notes: 'Board note', strokes: [] },
  }, t);
}

describe('export scope', () => {
  it('keeps the scope per mission and falls back to the whole mission for another mission', () => {
    resetExportScope();
    setExportScope('mission-a', { kind: 'side', side: 'red' });
    expect(readExportScope('mission-a')).toEqual({ kind: 'side', side: 'red' });
    expect(readExportScope('mission-b')).toEqual({ kind: 'mission' });
    resetExportScope();
    expect(readExportScope('mission-a')).toEqual({ kind: 'mission' });
  });

  it('builds a plan from the settings and the chosen scope', () => {
    const plan = buildExportPlan({ ...creator, kneeboardWidth: 2048 }, { kind: 'aircraft', aircraftType: 'F-16C_50' });
    expect(plan).toEqual({
      viewMode: 'creator',
      outputLanguage: DEFAULT_SETTINGS.outputLanguage,
      sections: creator.briefingSections,
      scope: { kind: 'aircraft', aircraftType: 'F-16C_50' },
      kneeboardWidth: 2048,
    });
  });
});

describe('flight selection', () => {
  const view = applyViewMode(fixtureMission(), 'creator', 'blue');

  it('selects by side, flight key and aircraft type', () => {
    expect(selectExportFlights(view, { kind: 'mission' }).map(item => item.key))
      .toEqual(['blue:1', 'blue:2', 'red:3']);
    expect(selectExportFlights(view, { kind: 'side', side: 'red' }).map(item => item.flight.callsign))
      .toEqual(['Bandit 1']);
    expect(selectExportFlights(view, { kind: 'flights', flightKeys: ['blue:1'] }).map(item => item.flight.callsign))
      .toEqual(['Viper 1']);
    expect(selectExportFlights(view, { kind: 'aircraft', aircraftType: 'MiG-29S' }).map(item => item.key))
      .toEqual(['red:3']);
  });

  it('reports a blocker when a section list is empty or a flight scope selects nothing', () => {
    expect(modelFor({ ...creator, briefingSections: [] }).blocker).toBe('noSections');
    expect(modelFor(creator, { kind: 'flights', flightKeys: ['red:99'] }).blocker).toBe('noFlights');
    expect(modelFor(creator).blocker).toBeNull();
  });
});

describe('pilot view (D1)', () => {
  it('keeps the other coalition and the threat section out of every page', () => {
    const model = modelFor(pilot);
    const text = JSON.stringify(model.pages);
    expect(text).not.toContain('Bandit 1');
    expect(text).not.toContain('Secret pilot');
    expect(text).not.toContain('SA-10');
    expect(model.pages.map(page => page.section)).not.toContain('threats');
    expect(text).not.toContain('Hidden 1');
    expect(text).toContain('Viper 1');
  });

  it('keeps the other coalition and threats in the creator view', () => {
    const model = modelFor(creator);
    expect(JSON.stringify(model.pages)).toContain('Bandit 1');
    expect(model.pages.map(page => page.section)).toContain('threats');
  });

  it('writes an unknown threat range as unrecorded, never as none', () => {
    const mission = fixtureMission();
    mission.coalitions.red.aiGroups[0].threatRangeSource = 'unknown';
    mission.coalitions.red.aiGroups[0].threatRange = 0;
    const view = applyViewMode(mission, 'creator', 'blue');
    const model = buildExportModel({ view, settings: creator, side: 'blue', scope: { kind: 'mission' }, whiteboard: { notes: '', strokes: [] } }, t);
    const threats = model.pages.find(page => page.kind === 'text' && page.section === 'threats');
    expect(JSON.stringify(threats)).toContain('export:label.unrecorded');
    expect(JSON.stringify(threats)).not.toContain('export:label.none');
  });

  it('exports the normalized JSON with only the displayed side notes in pilot view', () => {
    const mission = fixtureMission();
    const view = applyViewMode(mission, 'pilot', 'blue');
    const json = normalizedMissionJson(view, 'pilot');
    expect(Object.keys(json.userNotes.perFlight)).toEqual(['blue:1']);
    expect(normalizedMissionJson(mission, 'creator')).toBe(mission);
  });
});

describe('pages and Markdown', () => {
  it('writes the nav log as a table with the eight default columns', () => {
    const model = modelFor(creator, { kind: 'flights', flightKeys: ['blue:1'] });
    const route = model.pages.find(page => page.kind === 'text' && page.section === 'route');
    expect(route?.kind === 'text' && route.sections[0].table?.header).toHaveLength(8);
    const markdown = renderMarkdown(model.pages, { title: 'Export Test', viewLabel: 'creator', style: 'table' }, t);
    expect(markdown).toContain('| export:label.navNo | export:label.name |');
    expect(markdown).not.toContain('Bandit 1');
    expect(markdown).not.toContain('Hidden 1');
  });

  it('prints the displayed side task text on the overview and never the opposing one (D1)', () => {
    const mission = fixtureMission();
    mission.meta.descriptionBlueTask = 'Blue task text';
    mission.meta.descriptionRedTask = 'Red task text';
    const view = applyViewMode(mission, 'pilot', 'blue');
    const model = buildExportModel({
      view,
      settings: pilot,
      side: 'blue',
      scope: { kind: 'mission' },
      whiteboard: { notes: '', strokes: [] },
    }, t);
    const overview = JSON.stringify(model.pages.find(page => page.kind === 'text' && page.section === 'overview'));
    expect(overview).toContain('Blue task text');
    expect(overview).not.toContain('Red task text');
  });

  it('uses a fenced block for every section in code style', () => {
    const model = modelFor(creator, { kind: 'flights', flightKeys: ['blue:1'] });
    const markdown = renderMarkdown(model.pages, { title: 'Export Test', viewLabel: 'creator', style: 'code' }, t);
    expect(markdown).toContain('```text');
    expect(markdown).not.toContain('| export:label.navNo |');
  });

  it('escapes pipes in table cells', () => {
    const markdown = renderMarkdown([{
      kind: 'text',
      section: 'notes',
      title: 'Notes',
      sections: [{ heading: 'A', lines: [], table: { header: ['x'], rows: [['a|b']] } }],
    }], { title: 'T', viewLabel: 'creator', style: 'table' }, t);
    expect(markdown).toContain('| a\\|b |');
  });

  it('includes the whiteboard notes with the notes section', () => {
    const model = modelFor(creator, { kind: 'mission' });
    expect(model.pages.map(page => page.kind)).toContain('whiteboard');
    const markdown = renderMarkdown(model.pages, { title: 'T', viewLabel: 'creator', style: 'table' }, t);
    expect(markdown).toContain('Board note');
  });

  it('writes a nav-log row for every route point, not only the first forty', () => {
    const mission = fixtureMission();
    const first = mission.coalitions.blue.flights[0].route[0];
    mission.coalitions.blue.flights[0].route = Array.from({ length: 45 }, (_, index) => ({
      ...first,
      index: index + 1,
      name: `WP${index + 1}`,
    }));
    const view = applyViewMode(mission, 'creator', 'blue');
    const model = buildExportModel({
      view,
      settings: creator,
      side: 'blue',
      scope: { kind: 'flights', flightKeys: ['blue:1'] },
      whiteboard: { notes: '', strokes: [] },
    }, t);
    const route = model.pages.find(page => page.kind === 'text' && page.section === 'route');
    const rows = route?.kind === 'text' ? route.sections[0].table?.rows ?? [] : [];
    expect(rows).toHaveLength(45);
    expect(rows[44].slice(0, 2)).toEqual(['45', 'WP45']);
  });

  it('fences a code-style section with a longer fence when the text contains backticks', () => {
    const markdown = renderMarkdown([{
      kind: 'text',
      section: 'notes',
      title: 'Notes',
      sections: [{ heading: 'Memo', lines: ['```js', 'const x = 1;'] }],
    }], { title: 'T', viewLabel: 'creator', style: 'code' }, t);
    expect(markdown).toContain('````text\n```js\nconst x = 1;\n````');
  });
});

describe('file names (FR-86)', () => {
  it('replaces characters that are not allowed in Windows file names', () => {
    expect(safeFileStem('a/b:c*d')).toBe('a_b_c_d');
    expect(safeFileStem('   ')).toBe('briefing');
  });

  it('builds the kneeboard names from the sortie and the scope label only', () => {
    expect(kneeboardZipName('Sortie 1', 'Viper 1+Hawk 1')).toBe('Sortie 1-Viper 1+Hawk 1-kneeboard.zip');
    expect(kneeboardZipName('', 'mission')).toBe('briefing-mission-kneeboard.zip');
    expect(kneeboardMizName('Caucasus Test.miz', 'F-16C_50')).toBe('Caucasus Test-F-16C_50-kneeboard.miz');
  });
});
