import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useMission } from '../shell/MissionContext';
import type { DisplaySettings, MissionData, Side } from '../types/mission';
import type { WhiteboardData } from '../types/whiteboard';
import type { KneeboardPage, KneeboardTranslate } from '../utils/kneeboard';
import { aircraftTypesOf, buildExportModel, listExportFlights, type ExportModel } from './exportModel';
import { useExportScope, type ExportScope } from './exportPlan';

export interface ExportModelState {
  model: ExportModel;
  scope: ExportScope;
  /** Translator for output text (the output language, not the UI language, D7). */
  outT: KneeboardTranslate;
  /** Mission name and view label for headings. */
  title: string;
  viewLabel: string;
}

const EMPTY_WHITEBOARD: WhiteboardData = { notes: '', strokes: [] };

/**
 * The scope the output uses. In the pilot view only the displayed side exists, so a stored
 * "side" scope for the other side is read as the displayed side (D1): the screen and the
 * output then show the same choice. A stored aircraft type that the view has no flight of
 * (for example the other side's type after switching to the pilot view) is read as the first
 * type the view has, the one the select shows, so the choice is never stuck on an empty target.
 */
export function effectiveExportScope(
  scope: ExportScope,
  viewMode: DisplaySettings['viewMode'],
  side: Side,
  aircraftTypes: readonly string[] = [],
): ExportScope {
  if (viewMode === 'pilot' && scope.kind === 'side' && scope.side !== side) return { kind: 'side', side };
  if (scope.kind === 'aircraft' && aircraftTypes.length > 0 && !aircraftTypes.includes(scope.aircraftType)) {
    return { kind: 'aircraft', aircraftType: aircraftTypes[0] };
  }
  return scope;
}

interface BaseInput {
  view: MissionData;
  settings: DisplaySettings;
  side: Side;
  scope: ExportScope;
  language: DisplaySettings['outputLanguage'];
}

/**
 * The last base model. The export screen and the print document both call useExportModel with the
 * same mission, settings and scope, so the second call reuses the first call's model instead of
 * building the pages (and the map scenes) again.
 */
let lastBase: { input: BaseInput; model: ExportModel } | null = null;

function sameBaseInput(a: BaseInput, b: BaseInput): boolean {
  return a.view === b.view && a.settings === b.settings && a.side === b.side
    && a.scope === b.scope && a.language === b.language;
}

function baseModel(input: BaseInput, outT: KneeboardTranslate): ExportModel {
  if (lastBase && sameBaseInput(lastBase.input, input)) return lastBase.model;
  // The whiteboard is not part of the base: it is put in afterwards (see useExportModel), so a
  // keystroke on the whiteboard does not rebuild the map pages.
  const model = buildExportModel({ ...input, whiteboard: EMPTY_WHITEBOARD }, outT);
  lastBase = { input, model };
  return model;
}

/**
 * The export model for the mounted mission. The export screen and the print document both call
 * this, so they show the same plan and the same pages.
 */
export function useExportModel(): ExportModelState {
  const { i18n } = useTranslation();
  const { mission, view, settings, side, whiteboard } = useMission();
  const storedScope = useExportScope(mission.sourceFingerprint);
  const language = settings.outputLanguage;
  const aircraftTypes = useMemo(() => aircraftTypesOf(listExportFlights(view)), [view]);
  const scope = useMemo(
    () => effectiveExportScope(storedScope, settings.viewMode, side, aircraftTypes),
    [storedScope, settings.viewMode, side, aircraftTypes],
  );

  const outT = useMemo<KneeboardTranslate>(
    () => (key, options) => i18n.t(key, { ...options, lng: language }),
    [i18n, language],
  );

  const base = useMemo(
    () => baseModel({ view, settings, side, scope, language }, outT),
    [view, settings, side, scope, language, outT],
  );

  const model = useMemo<ExportModel>(() => {
    if (!base.pages.some(page => page.kind === 'whiteboard')) return base;
    // Only the whiteboard page changes while the user writes. Every other page object keeps its identity.
    const pages = base.pages.map((page): KneeboardPage => (
      page.kind === 'whiteboard' ? { ...page, data: whiteboard.data } : page
    ));
    return { ...base, pages };
  }, [base, whiteboard.data]);

  const viewLabel = outT(settings.viewMode === 'pilot' ? 'export:label.viewPilot' : 'export:label.viewCreator');
  return { model, scope, outT, title: mission.meta.sortie, viewLabel };
}
