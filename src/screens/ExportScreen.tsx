// Owner: P3 (出力). Export screen (SPEC 1.3 出力、F9). Left: what to export (scope, sections, presets,
// output language, view). Right: six format cards; only the selected card's primary button is emphasized.
// Reads everything through useMission() and useExportModel(); writes settings with useSettings().
// Pilot view (D1): threats are not offered, the other side is not offered, and the .miz embed is disabled,
// because a .miz copies every entry of the original file.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../hooks/useSettings';
import { useMission } from '../shell/MissionContext';
import { EXPORT_FLIGHT_ANCHOR, useWorkspace } from '../shell/workspace';
import { Field } from '../shell/Field';
import { Notice } from '../shell/Notice';
import { inertOutside } from '../shell/inert';
import { SideMark } from '../shell/SideMark';
import { Segmented } from '../shell/Segmented';
import { buildGeospatialExport, toGeoJson, toKml } from '../utils/geospatialExport';
import { createKneeboardMizCopy, createKneeboardPngZip, numberedKneeboardImages } from '../utils/kneeboardArchive';
import {
  countKneeboardPages,
  createMeasurementContext,
  kneeboardBudget,
  largestFittingWidth,
  MAX_KNEEBOARD_PAGES,
  renderKneeboardPages,
  type KneeboardRenderOptions,
} from '../utils/kneeboardRenderer';
import { BRIEFING_SECTIONS, MAX_BRIEFING_PRESETS, MAX_BRIEFING_PRESET_NAME_LENGTH, normalizeBriefingPresetName, type BriefingSection } from '../utils/briefingSections';
import { renderMarkdown, type MarkdownStyle } from '../export/markdown';
import { aircraftTypesOf, kneeboardMizName, kneeboardZipName, markdownFileName, normalizedMissionJson } from '../export/exportModel';
import { setExportScope, type ExportScope } from '../export/exportPlan';
import { useExportModel } from '../export/useExportModel';
import type { DisplaySettings, Side } from '../types/mission';
import type { KneeboardTranslate } from '../utils/kneeboard';

type TargetKind = ExportScope['kind'];
type FormatId = 'print' | 'kneeboard' | 'miz' | 'markdown' | 'geo' | 'json';
type KneeboardWidth = DisplaySettings['kneeboardWidth'];
type Progress = { done: number; total: number } | null;

const KNEEBOARD_WIDTHS: readonly KneeboardWidth[] = [1536, 2048, 3072];

export default function ExportScreen() {
  const { t } = useTranslation();
  const { mission, settings, side, sourceFile, view } = useMission();
  const { setBriefingSections, setBriefingPresets, setOutputLanguage, setViewMode, setKneeboardWidth } = useSettings();
  const { model, scope, outT, title, viewLabel } = useExportModel();
  const { focusAnchor, flightKey, clearFocusAnchor } = useWorkspace();
  const [format, setFormat] = useState<FormatId>('print');
  const [markdownStyle, setMarkdownStyle] = useState<MarkdownStyle>('table');
  const [status, setStatus] = useState<Partial<Record<FormatId, { tone: 'info' | 'error'; text: string }>>>({});
  const [busy, setBusy] = useState<FormatId | null>(null);
  const [progress, setProgress] = useState<Progress>(null);
  const [presetName, setPresetName] = useState('');
  const [presetNotice, setPresetNotice] = useState('');
  // Set when the last setting written from this screen could not be stored in the browser (decision 8): it still
  // applies on screen, and the warning says it is lost on reload.
  const [settingUnsaved, setSettingUnsaved] = useState(false);
  const stored = (saved: boolean) => setSettingUnsaved(!saved);
  const [previewOpen, setPreviewOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const previewOpenerRef = useRef<HTMLButtonElement>(null);
  const previewPrintRef = useRef<HTMLButtonElement>(null);
  const previewWasOpen = useRef(false);

  const selectedSections = settings.briefingSections;
  const orderedSections = useMemo<BriefingSection[]>(() => [
    ...selectedSections,
    ...BRIEFING_SECTIONS.filter(section => !selectedSections.includes(section)),
  ], [selectedSections]);
  const flightOptions = model.allFlights;
  const noSections = model.blocker === 'noSections';
  const noFlights = model.blocker === 'noFlights';
  const noSelection = selectedSections.length === 0;
  // With a selection but no output, the only cause is threats in pilot view (D1).
  const blockedReason = noSections
    ? t(noSelection ? 'export:ui.sectionsNone' : 'export:ui.threatsPilotOnly')
    : noFlights ? t('export:ui.emptyScope') : null;
  const markdown = useMemo(
    () => renderMarkdown(model.pages, { title, viewLabel, style: markdownStyle }, outT),
    [model.pages, title, viewLabel, markdownStyle, outT],
  );
  // The page count comes from the same pagination the renderer uses, so the estimate is exact.
  const measurement = useMemo(() => createMeasurementContext(), []);
  const pageEstimate = useMemo(
    () => countKneeboardPages(model.pages, outT, measurement),
    [model.pages, outT, measurement],
  );
  const budget = kneeboardBudget(pageEstimate, settings.kneeboardWidth);
  const kneeboardFits = budget.kind === 'ok';
  const suggestedWidth = largestFittingWidth(pageEstimate, KNEEBOARD_WIDTHS);
  const kneeboardLimitReason = budget.kind === 'pages'
    ? t('export:ui.kneeboardTooManyPages', { limit: MAX_KNEEBOARD_PAGES })
    : budget.kind === 'pixels'
      ? suggestedWidth
        ? t('export:ui.kneeboardTooMany', { width: suggestedWidth, pages: pageEstimate })
        : t('export:ui.kneeboardTooManyNoWidth')
      : undefined;
  const pilotView = settings.viewMode === 'pilot';
  const mizAllowed = scope.kind === 'mission' || scope.kind === 'aircraft';
  const mizReason = !mizAllowed
    ? t('export:ui.kneeboardMizNeedsMission')
    : !sourceFile ? t('export:ui.kneeboardMizNoSource')
    : pilotView ? t('export:ui.kneeboardMizPilot') : null;
  // Pilot view offers only the displayed side; the other side is not in the view at all (D1).
  const sideOptions: Side[] = pilotView ? [side] : ['blue', 'red'];

  // Close the print preview with Escape, and take it off the page when the screen goes away. While it is
  // open the focus moves into its bar, and the screen behind it is inert, so the keyboard does not reach
  // the controls under the preview. The bar itself stays usable.
  useEffect(() => {
    const root = document.documentElement;
    if (previewOpen) root.dataset.printPreview = 'on';
    else delete root.dataset.printPreview;
    if (!previewOpen) return undefined;
    // Everything outside the preview bar and the previewed document is inert: this screen, and also the header, the
    // left rail, the bottom tabs and the settings drawer, which the preview covers (A11Y-3).
    const bar = screenRef.current?.querySelector('.print-preview-bar');
    const restore = bar ? inertOutside(bar, element => element.classList.contains('print-briefing')) : () => {};
    previewPrintRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      restore();
      delete root.dataset.printPreview;
    };
  }, [previewOpen]);

  // Closing the preview returns the focus to the button that opened it. This runs after the effect above has
  // removed the inert mark, so the focus can land.
  useEffect(() => {
    if (previewOpen) {
      previewWasOpen.current = true;
      return;
    }
    if (!previewWasOpen.current) return;
    previewWasOpen.current = false;
    previewOpenerRef.current?.focus();
  }, [previewOpen]);

  const setScope = (next: ExportScope) => setExportScope(mission.sourceFingerprint, next);

  // "この資料を作る" on the flight screen arrives here with the flight chosen as the target (SPEC F9, T2).
  // A missing or unknown flight leaves the target as it is; the anchor is consumed either way.
  // A boolean, not the flight list: the list is rebuilt whenever the export model is, and this effect must
  // not run again because of that (the scope write re-renders the screen before the anchor is cleared).
  const chosenFlightInView = flightKey !== null && flightOptions.some(item => item.key === flightKey);
  useEffect(() => {
    if (focusAnchor !== EXPORT_FLIGHT_ANCHOR) return;
    if (chosenFlightInView && flightKey) {
      setExportScope(mission.sourceFingerprint, { kind: 'flights', flightKeys: [flightKey] });
    }
    clearFocusAnchor();
  }, [focusAnchor, flightKey, chosenFlightInView, mission.sourceFingerprint, clearFocusAnchor]);

  const changeTarget = (kind: TargetKind) => {
    if (kind === 'mission') setScope({ kind: 'mission' });
    else if (kind === 'side') setScope({ kind: 'side', side });
    else if (kind === 'flights') setScope({ kind: 'flights', flightKeys: model.flights.map(item => item.key) });
    else setScope({ kind: 'aircraft', aircraftType: aircraftTypesOf(flightOptions)[0] ?? '' });
  };

  const toggleFlight = (key: string) => {
    if (scope.kind !== 'flights') return;
    const next = scope.flightKeys.includes(key)
      ? scope.flightKeys.filter(item => item !== key)
      : [...scope.flightKeys, key];
    setScope({ kind: 'flights', flightKeys: next });
  };

  const toggleSection = (section: BriefingSection) => {
    const next = selectedSections.includes(section)
      ? selectedSections.filter(item => item !== section)
      : [...selectedSections, section];
    stored(setBriefingSections(next));
  };

  const moveSection = (section: BriefingSection, offset: -1 | 1) => {
    const index = selectedSections.indexOf(section);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= selectedSections.length) return;
    const next = [...selectedSections];
    [next[index], next[target]] = [next[target], next[index]];
    stored(setBriefingSections(next));
  };

  const savePreset = () => {
    const name = normalizeBriefingPresetName(presetName);
    if (!name) return;
    const existing = settings.briefingPresets.filter(preset => preset.name.toLowerCase() !== name.toLowerCase());
    if (existing.length >= MAX_BRIEFING_PRESETS) {
      setPresetNotice(t('export:ui.presetFull'));
      return;
    }
    const saved = setBriefingPresets([...existing, { name, sections: [...selectedSections] }]);
    setPresetName('');
    // "保存しました" only when the browser kept it (decision 8).
    setPresetNotice(t(saved ? 'export:ui.presetSaved' : 'export:ui.presetUnsaved'));
  };

  const applyPreset = (index: number) => {
    const preset = settings.briefingPresets[index];
    if (preset) stored(setBriefingSections(preset.sections));
  };

  const deletePreset = (index: number) => {
    stored(setBriefingPresets(settings.briefingPresets.filter((_, position) => position !== index)));
  };

  const report = (id: FormatId, tone: 'info' | 'error', text: string) => {
    setStatus(current => ({ ...current, [id]: { tone, text } }));
  };

  const runFormat = async (id: FormatId, action: () => Promise<void>) => {
    setBusy(id);
    setFormat(id);
    try {
      await action();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        report(id, 'info', t('export:kneeboard.aborted'));
      } else {
        const detail = error instanceof Error ? error.message : String(error);
        report(id, 'error', t('export:ui.failed', { detail }));
      }
    } finally {
      setBusy(null);
      setProgress(null);
      abortRef.current = null;
    }
  };

  /** Renders the kneeboard pages with a progress count and a stop button (SPEC 3, 出力の生成中). */
  const renderPagesWithProgress = (width: KneeboardWidth, outputT: KneeboardTranslate) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress({ done: 0, total: 0 });
    const options: KneeboardRenderOptions = {
      signal: controller.signal,
      onProgress: (done, total) => setProgress({ done, total }),
    };
    return renderKneeboardPages(model.pages, width, outputT, options);
  };

  const printDocument = () => {
    setFormat('print');
    window.print();
  };

  const makeKneeboard = () => runFormat('kneeboard', async () => {
    const pages = await renderPagesWithProgress(settings.kneeboardWidth, outT);
    const images = numberedKneeboardImages(pages);
    downloadBlob(new Blob([new Uint8Array(createKneeboardPngZip(images))], { type: 'application/zip' }), kneeboardZipName(title, model.label));
    report('kneeboard', 'info', t('export:ui.kneeboardSaved', { count: images.length }));
  });

  const makeMiz = () => runFormat('miz', async () => {
    if (!sourceFile) throw new Error(t('export:ui.kneeboardMizNoSource'));
    // The .miz copies every entry of the source file, so it may only be written from the creator view.
    if (pilotView) throw new Error(t('export:ui.kneeboardMizPilot'));
    const pages = await renderPagesWithProgress(settings.kneeboardWidth, outT);
    const images = numberedKneeboardImages(pages);
    const aircraftType = scope.kind === 'aircraft' ? scope.aircraftType : null;
    const result = createKneeboardMizCopy(new Uint8Array(await sourceFile.arrayBuffer()), images, aircraftType);
    downloadBlob(new Blob([new Uint8Array(result)], { type: 'application/octet-stream' }), kneeboardMizName(sourceFile.name, model.label));
    report('miz', 'info', t('export:ui.kneeboardSaved', { count: images.length }));
  });

  const copyMarkdown = () => runFormat('markdown', async () => {
    if (!navigator.clipboard) throw new Error(t('export:ui.markdownCopyFailed'));
    await navigator.clipboard.writeText(markdown);
    report('markdown', 'info', t('export:ui.markdownCopied'));
  });

  const saveMarkdown = () => runFormat('markdown', async () => {
    downloadBlob(new Blob([markdown], { type: 'text/markdown' }), markdownFileName(title, model.label));
    report('markdown', 'info', t('export:ui.markdownSaved', { name: markdownFileName(title, model.label) }));
  });

  const exportGeo = (kind: 'geojson' | 'kml') => runFormat('geo', async () => {
    // Routes follow the target (a flight, side or aircraft selection); the whole mission keeps its annotations and zones.
    const flightKeys = scope.kind === 'mission' ? undefined : new Set(model.flights.map(item => item.key));
    const result = buildGeospatialExport(mission, settings.viewMode, side, { flightKeys });
    if (result.features.length === 0) {
      report('geo', 'error', t('export:ui.geoEmpty', { skipped: result.skipped }));
      return;
    }
    const data = kind === 'geojson' ? toGeoJson(result) : toKml(result);
    const type = kind === 'geojson' ? 'application/geo+json' : 'application/vnd.google-earth.kml+xml';
    downloadBlob(new Blob([data], { type }), `fastbriefing-routes.${kind}`);
    report('geo', 'info', t('export:ui.geoSaved', { count: result.features.length, skipped: result.skipped }));
  });

  const saveJson = () => runFormat('json', async () => {
    const json = normalizedMissionJson(view, settings.viewMode);
    downloadBlob(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }), 'fastbriefing-mission.json');
    report('json', 'info', t('export:ui.saved', { name: 'fastbriefing-mission.json' }));
  });

  const cardClass = (id: FormatId) => `export-card${format === id ? ' is-selected' : ''}`;
  const primary = (id: FormatId) => `btn ${format === id ? 'btn-primary' : 'btn-secondary'}`;
  const statusLine = (id: FormatId) => {
    const current = status[id];
    if (!current) return null;
    return current.tone === 'error'
      ? <Notice tone="error">{current.text}</Notice>
      : <p className="export-status" role="status">{current.text}</p>;
  };
  const progressLine = (id: FormatId) => {
    if (busy !== id || !progress) return null;
    return (
      <div className="export-progress">
        <p className="export-status" role="status">{t('export:ui.kneeboardProgress', { done: progress.done, total: progress.total })}</p>
        <button type="button" className="btn btn-secondary" onClick={() => abortRef.current?.abort()}>{t('export:ui.kneeboardStop')}</button>
      </div>
    );
  };

  return (
    <div className="export-screen" ref={screenRef}>
      <aside className="export-plan" aria-label={t('export:ui.title')}>
        <h2 className="export-title">{t('export:ui.title')}</h2>
        {settingUnsaved && <Notice tone="warning">{t('settings:unsaved')}</Notice>}

        <Field label={t('export:ui.target')}>
          {() => (
            <Segmented<TargetKind>
              label={t('export:ui.target')}
              value={scope.kind}
              onChange={changeTarget}
              options={[
                { value: 'mission', label: t('export:ui.targetMission') },
                { value: 'side', label: t('export:ui.targetSide') },
                { value: 'flights', label: t('export:ui.targetFlights') },
                { value: 'aircraft', label: t('export:ui.targetAircraft') },
              ]}
            />
          )}
        </Field>

        {scope.kind === 'side' && (
          <Field label={t('export:ui.targetSide')}>
            {() => (
              <Segmented<Side>
                label={t('export:ui.targetSide')}
                value={scope.side}
                onChange={value => setScope({ kind: 'side', side: value })}
                options={sideOptions.map(value => ({ value, label: t(`shell:side.${value}`) }))}
              />
            )}
          </Field>
        )}

        {scope.kind === 'flights' && (
          <fieldset className="export-flight-picker">
            <legend>{t('export:ui.targetFlights')}</legend>
            {flightOptions.length === 0 && <p className="export-hint">{t('export:ui.targetFlightsNone')}</p>}
            {flightOptions.map(item => (
              <label key={item.key} className="export-flight-option">
                <input
                  type="checkbox"
                  checked={scope.flightKeys.includes(item.key)}
                  onChange={() => toggleFlight(item.key)}
                />
                <SideMark side={item.side} />
                <span>{item.flight.callsign || item.flight.name} · {item.flight.type}</span>
              </label>
            ))}
          </fieldset>
        )}

        {scope.kind === 'aircraft' && (
          <Field label={t('export:ui.targetAircraft')} disabledReason={model.aircraftTypes.length === 0 ? t('export:ui.targetAircraftNone') : undefined}>
            {id => (
              <select
                id={id}
                value={scope.aircraftType}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setScope({ kind: 'aircraft', aircraftType: event.target.value })}
              >
                {aircraftTypesOf(flightOptions).map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            )}
          </Field>
        )}

        <fieldset className="export-sections">
          <legend>{t('export:ui.sections')}</legend>
          <p className="export-hint">{t('export:ui.sectionsCount', { count: selectedSections.length, total: BRIEFING_SECTIONS.length })}</p>
          <ol className="export-section-list">
            {orderedSections.map(section => {
              const checked = selectedSections.includes(section);
              const position = selectedSections.indexOf(section);
              const pilotBlocked = section === 'threats' && pilotView;
              return (
                <li key={section} className="export-section-row">
                  <label>
                    <input type="checkbox" checked={checked} disabled={pilotBlocked} onChange={() => toggleSection(section)} />
                    <span>{t(`export:sections.${section}`)}</span>
                  </label>
                  {pilotBlocked && <span className="export-hint">{t('export:ui.threatsPilot')}</span>}
                  {checked && (
                    <span className="export-section-move">
                      <button type="button" className="btn btn-secondary" aria-label={`${t(`export:sections.${section}`)} ${t('export:ui.moveUp')}`} disabled={position <= 0} onClick={() => moveSection(section, -1)}>↑</button>
                      <button type="button" className="btn btn-secondary" aria-label={`${t(`export:sections.${section}`)} ${t('export:ui.moveDown')}`} disabled={position >= selectedSections.length - 1} onClick={() => moveSection(section, 1)}>↓</button>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </fieldset>

        <fieldset className="export-presets">
          <legend>{t('export:ui.presetTitle')}</legend>
          <Field label={t('export:ui.presetName')} hint={t('export:ui.presetHint', { max: MAX_BRIEFING_PRESET_NAME_LENGTH })}>
            {id => (
              <span className="export-preset-save">
                <input
                  id={id}
                  type="text"
                  value={presetName}
                  maxLength={MAX_BRIEFING_PRESET_NAME_LENGTH}
                  onChange={event => setPresetName(event.target.value)}
                />
                <button type="button" className="btn btn-secondary" onClick={savePreset} disabled={!normalizeBriefingPresetName(presetName)}>{t('export:ui.presetSave')}</button>
              </span>
            )}
          </Field>
          {presetNotice && <p className="export-hint" role="status">{presetNotice}</p>}
          <ul className="export-preset-list">
            {settings.briefingPresets.map((preset, index) => (
              <li key={preset.name}>
                <span>{preset.name}</span>
                <button type="button" className="btn btn-secondary" aria-label={`${preset.name} ${t('export:ui.presetApply')}`} onClick={() => applyPreset(index)}>{t('export:ui.presetApply')}</button>
                <button type="button" className="btn btn-secondary" aria-label={`${preset.name} ${t('export:ui.presetDelete')}`} onClick={() => deletePreset(index)}>{t('export:ui.presetDelete')}</button>
              </li>
            ))}
          </ul>
        </fieldset>

        <Field label={t('export:ui.outputLanguage')}>
          {() => (
            <Segmented<DisplaySettings['outputLanguage']>
              label={t('export:ui.outputLanguage')}
              value={settings.outputLanguage}
              onChange={value => stored(setOutputLanguage(value))}
              options={[
                { value: 'ja', label: '日本語' },
                { value: 'en', label: 'English' },
              ]}
            />
          )}
        </Field>

        <Field label={t('export:label.view')} hint={t('export:ui.viewHint')}>
          {() => (
            <Segmented<DisplaySettings['viewMode']>
              label={t('export:label.view')}
              value={settings.viewMode}
              onChange={value => stored(setViewMode(value))}
              options={[
                { value: 'creator', label: t('export:label.viewCreator') },
                { value: 'pilot', label: t('export:label.viewPilot') },
              ]}
            />
          )}
        </Field>
      </aside>

      <div className="export-formats">
        {blockedReason && <Notice tone="warning">{blockedReason}</Notice>}

        <section className={cardClass('print')} aria-labelledby="export-card-print">
          <h3 id="export-card-print">{t('export:ui.formatPrint')}</h3>
          <p className="export-hint">{t('export:ui.formatPrintHelp')}</p>
          <p className="export-hint">{t('export:ui.printHint')}</p>
          <div className="export-actions">
            <button ref={previewOpenerRef} type="button" className="btn btn-secondary" onClick={() => setPreviewOpen(true)} disabled={Boolean(blockedReason)}>{t('export:ui.printPreview')}</button>
            <button type="button" className={primary('print')} onClick={printDocument} disabled={Boolean(blockedReason)}>{t('export:ui.printDo')}</button>
          </div>
        </section>

        <section className={cardClass('kneeboard')} aria-labelledby="export-card-kneeboard">
          <h3 id="export-card-kneeboard">{t('export:ui.formatKneeboard')}</h3>
          <p className="export-hint">{t('export:ui.formatKneeboardHelp')}</p>
          <Field
            label={t('export:ui.kneeboardWidth')}
            hint={t('export:ui.kneeboardPages', { count: pageEstimate, limit: MAX_KNEEBOARD_PAGES })}
            disabledReason={kneeboardLimitReason}
          >
            {() => (
              <Segmented<string>
                label={t('export:ui.kneeboardWidth')}
                value={String(settings.kneeboardWidth)}
                onChange={value => stored(setKneeboardWidth(Number(value) as KneeboardWidth))}
                options={KNEEBOARD_WIDTHS.map(width => ({ value: String(width), label: String(width) }))}
              />
            )}
          </Field>
          <button
            type="button"
            className={primary('kneeboard')}
            onClick={() => void makeKneeboard()}
            disabled={Boolean(blockedReason) || !kneeboardFits || busy !== null}
          >
            {t('export:ui.kneeboardMake')}
          </button>
          {progressLine('kneeboard')}
          {statusLine('kneeboard')}
        </section>

        <section className={cardClass('miz')} aria-labelledby="export-card-miz">
          <h3 id="export-card-miz">{t('export:ui.formatMiz')}</h3>
          <p className="export-hint">{t('export:ui.formatMizHelp')}</p>
          {mizReason && <p className="export-hint">{mizReason}</p>}
          <button
            type="button"
            className={primary('miz')}
            onClick={() => void makeMiz()}
            disabled={Boolean(blockedReason) || Boolean(mizReason) || !kneeboardFits || busy !== null}
          >
            {t('export:ui.kneeboardMiz')}
          </button>
          {progressLine('miz')}
          {statusLine('miz')}
        </section>

        <section className={cardClass('markdown')} aria-labelledby="export-card-markdown">
          <h3 id="export-card-markdown">{t('export:ui.formatMarkdown')}</h3>
          <p className="export-hint">{t('export:ui.formatMarkdownHelp')}</p>
          <Segmented<MarkdownStyle>
            label={t('export:ui.markdownPreview')}
            value={markdownStyle}
            onChange={setMarkdownStyle}
            options={[
              { value: 'table', label: t('export:ui.markdownTable') },
              { value: 'code', label: t('export:ui.markdownCode') },
            ]}
          />
          <div className="export-actions">
            <button type="button" className={primary('markdown')} onClick={() => void copyMarkdown()} disabled={Boolean(blockedReason)}>{t('export:ui.markdownCopy')}</button>
            <button type="button" className="btn btn-secondary" onClick={() => void saveMarkdown()} disabled={Boolean(blockedReason)}>{t('export:ui.markdownSave')}</button>
          </div>
          {statusLine('markdown')}
          <details className="export-preview" open>
            <summary>{t('export:ui.markdownPreview')}</summary>
            <pre className="export-markdown" tabIndex={0}>{blockedReason ? t('export:ui.previewEmpty') : markdown}</pre>
          </details>
        </section>

        <section className={cardClass('geo')} aria-labelledby="export-card-geo">
          <h3 id="export-card-geo">{t('export:ui.formatGeo')}</h3>
          <p className="export-hint">{t('export:ui.formatGeoHelp')}</p>
          {scope.kind !== 'mission' && <p className="export-hint">{t('export:ui.targetFlightsOnly')}</p>}
          <div className="export-actions">
            <button type="button" className={primary('geo')} onClick={() => void exportGeo('geojson')}>GeoJSON</button>
            <button type="button" className="btn btn-secondary" onClick={() => void exportGeo('kml')}>KML</button>
          </div>
          {statusLine('geo')}
        </section>

        <details className="export-card export-advanced">
          <summary>{t('export:ui.formatJson')}</summary>
          <p className="export-hint">{t('export:ui.formatJsonHelp')}</p>
          <p className="export-hint">{t('export:ui.jsonNote')}</p>
          <button type="button" className={primary('json')} onClick={() => void saveJson()}>{t('export:ui.jsonSave')}</button>
          {statusLine('json')}
        </details>
      </div>

      {previewOpen && (
        <div className="print-preview-bar" role="region" aria-label={t('export:ui.printPreview')}>
          <span>{t('export:ui.printPreview')}</span>
          <button ref={previewPrintRef} type="button" className="btn btn-primary" onClick={printDocument}>{t('export:ui.printDo')}</button>
          <button type="button" className="btn btn-secondary" onClick={() => setPreviewOpen(false)}>{t('export:ui.printPreviewClose')}</button>
        </div>
      )}
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
