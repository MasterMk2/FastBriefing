import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AIGroup, MissionData, DisplaySettings, MissionMeta, SMEACNotes } from '../types/mission';
import { formatAltitude, formatSpeed, formatDistance, formatPressure, formatTemperature } from '../utils/units';
import { formatLegDuration, formatRouteCoordinate } from '../utils/routeLegs';
import { buildMetar } from '../utils/metar';
import {
  etaZuluDate,
  formatDateYMD,
  formatTimeHHMM,
  formatTimeHHMMSS,
  formatUtcOffset,
  missionLocalDate,
  missionZuluDate,
} from '../utils/time';
import PrintView from './PrintView';
import { useSettings } from '../hooks/useSettings';
import { applyViewMode } from '../utils/viewMode';
import { buildGeospatialExport, toGeoJson, toKml } from '../utils/geospatialExport';
import { planKneeboardPages } from '../utils/kneeboard';
import { renderKneeboardPages } from '../utils/kneeboardRenderer';
import { createKneeboardMizCopy, createKneeboardPngZip, numberedKneeboardImages } from '../utils/kneeboardArchive';

interface ExportTabProps {
  mission: MissionData;
  settings: DisplaySettings;
  sourceFile: File | null;
}

export default function ExportTab({ mission, settings, sourceFile }: ExportTabProps) {
  const { t } = useTranslation();
  const { setOutputLanguage } = useSettings();
  const viewMission = useMemo(() => applyViewMode(mission, settings.viewMode), [mission, settings.viewMode]);
  const [markdown, setMarkdown] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [pngStatus, setPngStatus] = useState('');
  const [pngBusy, setPngBusy] = useState(false);
  const [kneeboardWidth, setKneeboardWidth] = useState(1536);
  const [aircraftType, setAircraftType] = useState('');
  const [geoStatus, setGeoStatus] = useState('');
  const aircraftTypes = useMemo(() => [...new Set([
    ...viewMission.coalitions.blue.flights,
    ...viewMission.coalitions.red.flights,
  ].map(flight => flight.type).filter(type => /^[A-Za-z0-9_-]+$/.test(type)))].sort(), [viewMission]);

  const exportGeospatial = (format: 'geojson' | 'kml') => {
    const result = buildGeospatialExport(mission, settings.viewMode);
    if (result.features.length === 0) {
      setGeoStatus(t('export.geoEmpty', { skipped: result.skipped }));
      return;
    }
    const data = format === 'geojson' ? toGeoJson(result) : toKml(result);
    const type = format === 'geojson' ? 'application/geo+json' : 'application/vnd.google-earth.kml+xml';
    const url = URL.createObjectURL(new Blob([data], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `fastbriefing-routes.${format}`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setGeoStatus(t('export.geoSaved', { count: result.features.length, skipped: result.skipped }));
  };

  const exportNormalizedJson = () => {
    const visibleFlights = new Set([
      ...viewMission.coalitions.blue.flights.map(flight => `blue:${flight.groupId}`),
      ...viewMission.coalitions.red.flights.map(flight => `red:${flight.groupId}`),
    ]);
    const userNotes = settings.viewMode === 'creator' ? viewMission.userNotes : {
      ...viewMission.userNotes,
      perFlight: Object.fromEntries(Object.entries(viewMission.userNotes.perFlight)
        .filter(([key]) => visibleFlights.has(key))),
    };
    const json = JSON.stringify({ ...viewMission, userNotes }, null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fastbriefing-mission.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const outputT = (key: string, options?: Record<string, string | number>) => t(key, {
    ...options,
    lng: settings.outputLanguage,
  });

  const generateMarkdown = () => {
    const { meta, weather, coalitions } = viewMission;
    const localDate = missionLocalDate(meta);
    const zuluDate = missionZuluDate(meta);
    const metar = buildMetar(weather, { time: zuluDate });
    let md = '';

    md += `# ${meta.sortie}\n\n`;
    md += `**${outputT('export.markdown.view')}**: ${outputT(settings.viewMode === 'pilot' ? 'export.markdown.pilotView' : 'export.markdown.creatorView')}  \n\n`;
    md += `**${outputT('export.markdown.map')}**: ${meta.theatre}  \n`;
    md += `**${outputT('export.markdown.date')}**: ${formatDateYMD(localDate)}  \n`;
    md += `**${outputT('export.markdown.startLocal')}**: ${formatTimeHHMM(localDate)} (${formatUtcOffset(meta.utcOffset)})  \n`;
    md += `**${outputT('export.markdown.startZulu')}**: ${formatTimeHHMM(zuluDate)}Z  \n\n`;

    md += `## ${outputT('export.markdown.weather')}\n\n`;
    md += `- **${outputT('export.markdown.temperature')}**: ${formatTemperature(weather.temperature, settings.temperatureUnit)}  \n`;
    md += `- **${outputT('export.markdown.qnh')}**: ${formatPressure(weather.qnh, settings.pressureUnit)}  \n`;
    md += `- **${outputT('export.markdown.visibility')}**: ${formatDistance(weather.visibility, settings.distanceUnit)}  \n`;
    md += `- **${outputT('export.markdown.clouds')}**: ${weather.clouds.label} (${outputT('export.markdown.cloudBase', { value: formatAltitude(weather.clouds.base, settings.altitudeUnit) })})  \n`;
    md += `- **${outputT('export.markdown.metar')}**: ${metar}  \n`;
    md += `\n### ${outputT('export.markdown.wind')}\n\n`;
    md += `| ${outputT('export.markdown.altitude')} | ${outputT('export.markdown.windFrom')} | ${outputT('export.markdown.windSpeed')} |\n|------|-------------|------|\n`;
    weather.wind.forEach(w => {
      const level = w.level === 'ground' ? outputT('export.markdown.ground') : w.level === '2000' ? '2000m' : '8000m';
      md += `| ${level} | ${w.from}° | ${formatSpeed(w.speed, settings.speedUnit)} |\n`;
    });
    md += '\n';

    const smeacSections: (keyof SMEACNotes)[] = [
      'situation', 'mission', 'execution', 'adminLogistics', 'commandSignal',
    ];
    if (smeacSections.some(section => viewMission.userNotes.smeac[section].trim())) {
      md += `## ${outputT('notes.smeacTitle')}\n\n`;
      for (const section of smeacSections) {
        const value = viewMission.userNotes.smeac[section].trim();
        if (value) md += `### ${outputT(`notes.smeac.${section}`)}\n\n${value}\n\n`;
      }
    }

    md += `## ${outputT('export.markdown.flightList')}\n\n`;
    [...coalitions.blue.flights, ...coalitions.red.flights].forEach(flight => {
      const side = coalitions.blue.flights.includes(flight) ? 'Blue' : 'Red';
      const notes = viewMission.userNotes.perFlight[`${side.toLowerCase()}:${flight.groupId}`];
      md += `### ${side} - ${flight.callsign} (${flight.name}) [${flight.type} ×${flight.units.length}]\n\n`;
      md += `- **${outputT('export.markdown.task')}**: ${flight.task}\n`;
      md += `- **${outputT('export.markdown.groupFrequency')}**: ${(flight.frequency / 1000000).toFixed(3)} MHz (${flight.modulation === 0 ? 'AM' : 'FM'})\n\n`;
      if (notes) {
        if (notes.pilotName) md += `- **${outputT('notes.pilotName')}**: ${notes.pilotName}\n`;
        if (notes.tot) md += `- **${outputT('notes.tot')}**: ${notes.tot}\n`;
        if (notes.jokerFuel !== null) md += `- **${outputT('notes.jokerFuel')}**: ${notes.jokerFuel}\n`;
        if (notes.bingoFuel !== null) md += `- **${outputT('notes.bingoFuel')}**: ${notes.bingoFuel}\n`;
        if (notes.customNotes) md += `- **${outputT('notes.customNotes')}**: ${notes.customNotes}\n`;
        md += '\n';
      }

      md += `#### ${outputT('export.markdown.route')}\n\n`;
      md += `| # | ${outputT('export.markdown.name')} | ${outputT('export.markdown.type')} | ${outputT('export.markdown.coordinate')} | ${outputT('export.markdown.altitude')} | ${outputT('export.markdown.speed')} | ${outputT('export.markdown.eta')} | ${outputT('flights.distance')} | ${outputT('flights.bearing')} | ${outputT('flights.legTime')} | ${outputT('flights.cumulativeDistance')} | ${outputT('flights.cumulativeTime')} |\n|---|------|------|------|------|------|-----|------|------|------|------|------|\n`;
      flight.route.forEach(wp => {
        const coordinate = formatRouteCoordinate(wp, settings.coordinateFormat);
        const bearing = wp.leg ? wp.leg.magneticBearing === undefined
          ? outputT('flights.trueBearingOnly', { trueBearing: wp.leg.trueBearing.toFixed(0) })
          : outputT('flights.bearingValue', { trueBearing: wp.leg.trueBearing.toFixed(0), magneticBearing: wp.leg.magneticBearing.toFixed(0) }) : '-';
        md += `| ${wp.index} | ${wp.name} | ${wp.action} | ${coordinate} | ${formatAltitude(wp.alt, settings.altitudeUnit)} | ${formatSpeed(wp.speed, settings.speedUnit)} | ${formatETA(wp.eta, meta)} | ${wp.leg ? formatDistance(wp.leg.distance, settings.distanceUnit) : '-'} | ${bearing} | ${formatLegDuration(wp.leg?.time)} | ${wp.leg ? formatDistance(wp.leg.cumulativeDistance, settings.distanceUnit) : '-'} | ${formatLegDuration(wp.leg?.cumulativeTime)} |\n`;
      });
      md += '\n';

      md += `#### ${outputT('export.markdown.radioPreset')}\n\n`;
      md += `| CH | ${outputT('export.markdown.frequencyMHz')} | ${outputT('export.markdown.modulation')} | ${outputT('export.markdown.name')} |\n|----|--------------|------|------|\n`;
      flight.units[0].radios.forEach(radio => {
        md += `| ${radio.channel} | ${radio.frequency.toFixed(3)} | ${radio.modulation === 0 ? 'AM' : 'FM'} | ${radio.name} |\n`;
      });
      md += '\n';
    });

    md += `## ${outputT('export.markdown.support')}\n\n`;
    [...coalitions.blue.support, ...coalitions.red.support].forEach(s => {
      md += `- **${s.kind.toUpperCase()}**: ${s.callsign}`;
      if (s.frequency) md += ` - ${(s.frequency / 1000000).toFixed(3)} MHz`;
      if (s.tacan) md += ` - TACAN ${s.tacan.channel}`;
      md += '\n';
    });
    md += '\n';

    const threats = coalitions.red.aiGroups.filter(hasResolvedThreatRange);
    const unrecordedThreats = coalitions.red.aiGroups.filter(isUnrecordedThreat);
    md += `## ${outputT('export.markdown.threats')}\n\n`;
    if (threats.length === 0) {
      md += `${outputT('export.markdown.noThreats')}\n\n`;
    } else {
      md += `| ${outputT('export.markdown.type')} | ${outputT('export.markdown.count')} | ${outputT('export.markdown.engagementRange')} | ${outputT('export.markdown.detectionRange')} |\n|------|------:|--------------------|------------------|\n`;
      threats.forEach(group => {
        const engagementRange = group.threatRange && group.threatRange > 0
          ? formatDistance(group.threatRange, settings.distanceUnit)
          : outputT('export.markdown.none');
        const detectionRange = group.detectionRange && group.detectionRange > 0
          ? formatDistance(group.detectionRange, settings.distanceUnit)
          : outputT('export.markdown.none');
        md += `| ${group.type} | ${group.count} | ${engagementRange} | ${detectionRange} |\n`;
      });
      md += '\n';
    }
    if (unrecordedThreats.length > 0) {
      md += `### ${outputT('export.markdown.unrecordedThreats')}\n\n`;
      md += `| ${outputT('export.markdown.type')} | ${outputT('export.markdown.count')} | ${outputT('export.markdown.engagementRange')} | ${outputT('export.markdown.detectionRange')} |\n|------|------:|--------------------|------------------|\n`;
      unrecordedThreats.forEach(group => {
        md += `| ${group.type} | ${group.count} | ${outputT('export.markdown.unrecorded')} | ${outputT('export.markdown.unrecorded')} |\n`;
      });
      md += '\n';
    }

    md += `## ${outputT('export.markdown.commsPlan')}\n\n`;
    md += `| ${outputT('export.markdown.callsign')} | ${outputT('export.markdown.side')} | CH | ${outputT('export.markdown.frequencyMHz')} | ${outputT('export.markdown.modulation')} | ${outputT('export.markdown.name')} |\n|--------------|----|----|--------------|------|------|\n`;
    [...coalitions.blue.flights, ...coalitions.red.flights].forEach(flight => {
      const side = coalitions.blue.flights.includes(flight) ? 'Blue' : 'Red';
      flight.units[0].radios.forEach(radio => {
        md += `| ${flight.callsign} | ${side} | ${radio.channel} | ${radio.frequency.toFixed(3)} | ${radio.modulation === 0 ? 'AM' : 'FM'} | ${radio.name} |\n`;
      });
    });
    md += `| ${outputT('export.markdown.guardUhf')} | ${outputT('export.markdown.all')} | - | 243.000 | AM | ${outputT('export.markdown.guard')} |\n`;
    md += `| ${outputT('export.markdown.guardVhf')} | ${outputT('export.markdown.all')} | - | 121.500 | AM | ${outputT('export.markdown.guard')} |\n`;

    setMarkdown(md);
    setCopyStatus('');
  };

  const copyMarkdown = async () => {
    if (!markdown) return;

    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(markdown);
      setCopyStatus(t('export.copied'));
    } catch {
      setCopyStatus(t('export.copyFailed'));
    }
  };

  const printBriefing = () => {
    window.print();
  };

  const exportKneeboard = async (format: 'zip' | 'miz') => {
    if (pngBusy) return;
    setPngBusy(true);
    setPngStatus(t('export.pngGenerating'));

    try {
      const outputT = (key: string, options?: Record<string, string | number>) =>
        t(key, { ...options, lng: settings.outputLanguage });
      const pages = planKneeboardPages(mission, settings, outputT, aircraftType || null);
      const pngs = await renderKneeboardPages(pages, kneeboardWidth, outputT);
      const images = numberedKneeboardImages(pngs);
      let result: Uint8Array;
      let filename: string;
      if (format === 'miz') {
        if (!sourceFile) throw new Error('Mission source file unavailable');
        result = createKneeboardMizCopy(new Uint8Array(await sourceFile.arrayBuffer()), images, aircraftType || null);
        filename = `${safeFilename(sourceFile.name.replace(/\.miz$/i, ''))}-kneeboard.miz`;
      } else {
        result = createKneeboardPngZip(images);
        filename = `${safeFilename(mission.meta.sortie || 'briefing')}-kneeboard.zip`;
      }
      const blob = new Blob([result as BlobPart], { type: 'application/zip' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      setPngStatus(t('export.pngSaved', { count: images.length }));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setPngStatus(t('export.pngFailed', { detail }));
    } finally {
      setPngBusy(false);
    }
  };

  return (
    <div className="tab-panel export">
      <div className="export-actions">
        <button onClick={generateMarkdown} className="btn btn-primary">{t('export.generateMarkdown')}</button>
        <button onClick={exportNormalizedJson} className="btn btn-secondary">{t('export.normalizedJson')}</button>
        <button onClick={() => exportGeospatial('geojson')} className="btn btn-secondary">{t('export.geoJson')}</button>
        <button onClick={() => exportGeospatial('kml')} className="btn btn-secondary">{t('export.kml')}</button>
        <button onClick={copyMarkdown} className="btn" disabled={!markdown}>{t('export.copy')}</button>
        <button onClick={printBriefing} className="btn btn-secondary">{t('export.printPdf')}</button>
        <button onClick={() => void exportKneeboard('zip')} className="btn btn-secondary" disabled={pngBusy}>{t('export.generatePng')}</button>
        <button onClick={() => void exportKneeboard('miz')} className="btn btn-secondary" disabled={pngBusy || !sourceFile}>{t('export.embedMiz')}</button>
        <label>
          {t('export.kneeboardWidth')}
          <input type="number" min={768} max={3072} step={3} value={kneeboardWidth}
            onChange={event => setKneeboardWidth(Number(event.target.value))} />
        </label>
        <label>
          {t('export.kneeboardTarget')}
          <select value={aircraftType} onChange={event => setAircraftType(event.target.value)}>
            <option value="">{t('export.kneeboardAll')}</option>
            {aircraftTypes.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label>
          {t('app.outputLanguage')}
          <select
            value={settings.outputLanguage}
            onChange={(event) => setOutputLanguage(event.target.value as DisplaySettings['outputLanguage'])}
            aria-label={t('app.outputLanguage')}
          >
            <option value="ja">{t('app.japanese')}</option>
            <option value="en">{t('app.english')}</option>
          </select>
        </label>
        {copyStatus && <span className="hint" role="status">{copyStatus}</span>}
        {pngStatus && <span className="hint" role="status">{pngStatus}</span>}
        {geoStatus && <span className="hint" role="status">{geoStatus}</span>}
      </div>

      {markdown && (
        <div className="markdown-preview">
          <h3>{t('export.preview')}</h3>
          <pre>{markdown}</pre>
        </div>
      )}

      <section className="section export-help">
        <h3>{t('export.printImageExport')}</h3>
        <p>{t('export.printHelp')}</p>
        <p className="hint">{t('export.pngHelp')}</p>
      </section>

      <div className="print-briefing">
        <PrintView mission={mission} settings={settings} />
      </div>
    </div>
  );
}

function formatETA(eta: number, meta: MissionMeta): string {
  return `${formatTimeHHMMSS(etaZuluDate(meta, eta))}Z`;
}

function safeFilename(value: string): string {
  const filename = value.replace(/[\\/:*?"<>|]/g, '_').trim();
  return filename || 'briefing';
}

function hasResolvedThreatRange(group: AIGroup): boolean {
  const hasEngagementRange = Number.isFinite(group.threatRange)
    && (group.threatRange ?? 0) > 0;
  const hasDetectionRange = Number.isFinite(group.detectionRange)
    && (group.detectionRange ?? 0) > 0;
  return hasEngagementRange || hasDetectionRange;
}

function isUnrecordedThreat(group: AIGroup): boolean {
  if (hasResolvedThreatRange(group)) return false;
  if (group.threatRangeSource === 'unknown') return true;
  if (group.threatRangeSource === 'reference' || group.threatRangeSource === 'detection') return false;

  const category = group.category.trim().toLowerCase();
  const isThreatCandidate = category === 'vehicle' || category === 'ship';
  if (!isThreatCandidate) return false;

  return (!Number.isFinite(group.threatRange) || (group.threatRange ?? 0) <= 0)
    && (!Number.isFinite(group.detectionRange) || (group.detectionRange ?? 0) <= 0);
}
