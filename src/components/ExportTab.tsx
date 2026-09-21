import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { zipSync } from 'fflate';
import type { AIGroup, MissionData, DisplaySettings, MissionMeta } from '../types/mission';
import type { WhiteboardData } from '../types/whiteboard';
import { formatAltitude, formatSpeed, formatDistance, formatPressure, formatTemperature } from '../utils/units';
import { formatCoordinate } from '../utils/coordinates';
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
import { hasBriefingSection } from '../utils/briefingSections';
import {
  buildBriefingPngSections,
  paginateBriefingPngSection,
  wrapBriefingPngLines,
  type BriefingPngPage,
} from '../utils/briefingPng';

interface ExportTabProps {
  mission: MissionData;
  settings: DisplaySettings;
  whiteboard: WhiteboardData;
}

export default function ExportTab({ mission, settings, whiteboard }: ExportTabProps) {
  const { t } = useTranslation();
  const { setOutputLanguage } = useSettings();
  const viewMission = useMemo(() => applyViewMode(mission, settings.viewMode), [mission, settings.viewMode]);
  const [markdown, setMarkdown] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [pngStatus, setPngStatus] = useState('');
  const canExportPng = settings.briefingSections.length > 0;

  useEffect(() => {
    setMarkdown('');
    setCopyStatus('');
  }, [settings, viewMission, whiteboard]);

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
    if (hasBriefingSection(settings.briefingSections, 'overview')) {
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
    }

    if (hasBriefingSection(settings.briefingSections, 'map')) {
      md += `## ${outputT('export.markdown.mapSection')}\n\n`;
      md += `- **${outputT('export.markdown.map')}**: ${meta.theatre}\n`;
      md += `${outputT('export.markdown.mapScreenNote')}\n\n`;
    }

    if (hasBriefingSection(settings.briefingSections, 'flights')) {
      md += `## ${outputT('export.markdown.flightList')}\n\n`;
      [...coalitions.blue.flights, ...coalitions.red.flights].forEach(flight => {
        const side = coalitions.blue.flights.includes(flight) ? 'Blue' : 'Red';
        md += `### ${side} - ${flight.callsign} (${flight.name}) [${flight.type} ×${flight.units.length}]\n\n`;
        md += `- **${outputT('export.markdown.task')}**: ${flight.task}\n`;
        md += `- **${outputT('export.markdown.groupFrequency')}**: ${(flight.frequency / 1000000).toFixed(3)} MHz (${flight.modulation === 0 ? 'AM' : 'FM'})\n\n`;

        md += `#### ${outputT('export.markdown.route')}\n\n`;
        md += `| # | ${outputT('export.markdown.name')} | ${outputT('export.markdown.type')} | ${outputT('export.markdown.coordinate')} | ${outputT('export.markdown.altitude')} | ${outputT('export.markdown.speed')} | ${outputT('export.markdown.eta')} |\n|---|------|------|------|------|------|-----|\n`;
        flight.route.forEach(wp => {
          const coordinate = formatCoordinate(wp.latlon[0], wp.latlon[1], settings.coordinateFormat);
          md += `| ${wp.index} | ${wp.name} | ${wp.action} | ${coordinate} | ${formatAltitude(wp.alt, settings.altitudeUnit)} | ${formatSpeed(wp.speed, settings.speedUnit)} | ${formatETA(wp.eta, meta)} |\n`;
        });
        md += '\n';

        md += `#### ${outputT('export.markdown.radioPreset')}\n\n`;
        md += `| CH | ${outputT('export.markdown.frequencyMHz')} | ${outputT('export.markdown.modulation')} | ${outputT('export.markdown.name')} |\n|----|--------------|------|------|\n`;
        flight.units[0].radios.forEach(radio => {
          md += `| ${radio.channel} | ${radio.frequency.toFixed(3)} | ${radio.modulation === 0 ? 'AM' : 'FM'} | ${radio.name} |\n`;
        });
        md += '\n';
      });
    }

    if (hasBriefingSection(settings.briefingSections, 'support')) {
      md += `## ${outputT('export.markdown.support')}\n\n`;
      [...coalitions.blue.support, ...coalitions.red.support].forEach(s => {
        md += `- **${s.kind.toUpperCase()}**: ${s.callsign}`;
        if (s.frequency) md += ` - ${(s.frequency / 1000000).toFixed(3)} MHz`;
        if (s.tacan) md += ` - TACAN ${s.tacan.channel}`;
        md += '\n';
      });
      md += '\n';
    }

    if (hasBriefingSection(settings.briefingSections, 'threats')) {
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
    }

    if (hasBriefingSection(settings.briefingSections, 'comms')) {
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
      md += '\n';
    }

    if (hasBriefingSection(settings.briefingSections, 'whiteboard')) {
      md += `## ${outputT('export.markdown.whiteboard')}\n\n`;
      md += whiteboard.notes.trim()
        ? `${whiteboard.notes.trim()}\n\n`
        : `_${outputT('export.markdown.noWhiteboardNotes')}_\n\n`;
      if (whiteboard.strokes.length > 0) {
        md += `_${outputT('export.markdown.whiteboardDrawing', { count: whiteboard.strokes.length })}_\n\n`;
      }
    }

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

  const exportPng = async () => {
    setPngStatus(t('export.pngGenerating'));

    try {
      const pageEntries = buildBriefingPngSections(viewMission, settings, whiteboard, outputT)
        .flatMap(section => {
          const measurementCanvas = document.createElement('canvas');
          const measurementContext = measurementCanvas.getContext('2d');
          if (!measurementContext) throw new Error('Canvas 2D context unavailable');
          measurementContext.font = '28px sans-serif';
          const wrappedLines = wrapBriefingPngLines(
            section.lines,
            text => measurementContext.measureText(text).width,
            1536 - 96 * 2,
          );
          return paginateBriefingPngSection(section, wrappedLines);
        });
      if (pageEntries.length === 0) throw new Error('No briefing sections selected');

      const baseName = safeFilename(mission.meta.sortie || 'briefing');
      const pngFiles: Record<string, Uint8Array> = {};
      for (const [index, page] of pageEntries.entries()) {
        const canvas = document.createElement('canvas');
        canvas.width = 1536;
        canvas.height = 2048;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D context unavailable');

        drawBriefingPngPage(context, viewMission, whiteboard, page, index + 1, pageEntries.length);
        const blob = await canvasToBlob(canvas);
        if (!blob) throw new Error('PNG blob unavailable');
        const filename = `${baseName}-briefing-${String(index + 1).padStart(2, '0')}-${page.sectionId}.png`;
        pngFiles[filename] = new Uint8Array(await blob.arrayBuffer());
      }

      const filenames = Object.keys(pngFiles);
      if (filenames.length === 1) {
        downloadBlob(
          new Blob([pngFiles[filenames[0]].buffer as ArrayBuffer], { type: 'image/png' }),
          filenames[0],
        );
      } else {
        const archive = zipSync(pngFiles, { level: 0 });
        downloadBlob(
          new Blob([archive.buffer as ArrayBuffer], { type: 'application/zip' }),
          `${baseName}-briefing-png.zip`,
        );
      }
      setPngStatus(t('export.pngSaved', { count: pageEntries.length }));
    } catch {
      setPngStatus(t('export.pngFailed'));
    }
  };

  return (
    <div className="tab-panel export">
      <div className="export-actions">
        <button onClick={generateMarkdown} className="btn btn-primary">{t('export.generateMarkdown')}</button>
        <button onClick={copyMarkdown} className="btn" disabled={!markdown}>{t('export.copy')}</button>
        <button onClick={printBriefing} className="btn btn-secondary">{t('export.printPdf')}</button>
        <button
          onClick={exportPng}
          className="btn btn-secondary"
          disabled={!canExportPng}
          aria-describedby={!canExportPng ? 'png-empty-selection-help' : undefined}
        >
          {t('export.generatePng')}
        </button>
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
        {!canExportPng && (
          <span className="hint" id="png-empty-selection-help">{t('export.pngNoSections')}</span>
        )}
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
        <PrintView mission={mission} settings={settings} whiteboard={whiteboard} />
      </div>
    </div>
  );
}

function formatETA(eta: number, meta: MissionMeta): string {
  return `${formatTimeHHMMSS(etaZuluDate(meta, eta))}Z`;
}

function drawBriefingPngPage(
  context: CanvasRenderingContext2D,
  mission: MissionData,
  whiteboard: WhiteboardData,
  page: BriefingPngPage,
  pageNumber: number,
  pageCount: number,
): void {
  const margin = 96;
  const contentWidth = 1536 - margin * 2;

  context.fillStyle = getThemeColor('--color-export-canvas-background');
  context.fillRect(0, 0, 1536, 2048);
  context.fillStyle = getThemeColor('--color-heading');
  context.font = 'bold 48px sans-serif';
  context.fillText(mission.meta.sortie || 'Briefing', margin, 130, contentWidth);

  context.font = 'bold 36px sans-serif';
  context.fillText(page.title, margin, 215, contentWidth);

  context.fillStyle = getThemeColor('--color-text-tertiary');
  context.font = '28px sans-serif';
  page.lines.forEach((line, index) => {
    context.fillText(line, margin, 300 + index * 40, contentWidth);
  });

  if (page.drawWhiteboard) {
    drawWhiteboardSummary(context, whiteboard, margin, 720, contentWidth, 800);
  }

  context.fillStyle = getThemeColor('--color-text-tertiary');
  context.font = '22px sans-serif';
  context.textAlign = 'right';
  context.fillText(`${pageNumber} / ${pageCount}`, 1536 - margin, 1980);
  context.textAlign = 'left';
}

function drawWhiteboardSummary(
  context: CanvasRenderingContext2D,
  whiteboard: WhiteboardData,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const scale = Math.min(width / 1200, height / 675);
  context.save();
  context.fillStyle = '#ffffff';
  context.strokeStyle = '#d0d5dd';
  context.lineWidth = 2;
  context.fillRect(x, y, 1200 * scale, 675 * scale);
  context.strokeRect(x, y, 1200 * scale, 675 * scale);
  context.translate(x, y);
  context.scale(scale, scale);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  whiteboard.strokes.forEach(stroke => {
    if (stroke.points.length === 0) return;
    context.beginPath();
    context.moveTo(stroke.points[0].x, stroke.points[0].y);
    stroke.points.slice(1).forEach(point => context.lineTo(point.x, point.y));
    context.strokeStyle = stroke.color;
    context.lineWidth = stroke.width;
    context.stroke();
  });
  context.restore();
}

function getThemeColor(token: string): string {
  if (typeof document === 'undefined') return `var(${token})`;
  const value = document.defaultView?.getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value || `var(${token})`;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise(resolve => {
    canvas.toBlob(resolve, 'image/png');
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
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
