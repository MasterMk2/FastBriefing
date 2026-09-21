import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
      const canvas = document.createElement('canvas');
      canvas.width = 1536;
      canvas.height = 2048;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context unavailable');

      drawBriefingSummary(context, viewMission, settings, whiteboard, outputT);
      const blob = await canvasToBlob(canvas);
      if (!blob) throw new Error('PNG blob unavailable');

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${safeFilename(mission.meta.sortie || 'briefing')}-briefing.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      setPngStatus(t('export.pngSaved'));
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
        <button onClick={exportPng} className="btn btn-secondary">{t('export.generatePng')}</button>
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

function drawBriefingSummary(
  context: CanvasRenderingContext2D,
  mission: MissionData,
  settings: DisplaySettings,
  whiteboard: WhiteboardData,
  t: (key: string, options?: Record<string, string | number>) => string,
): void {
  const { meta, weather } = mission;
  const localDate = missionLocalDate(meta);
  const zuluDate = missionZuluDate(meta);
  const metar = buildMetar(weather, { time: zuluDate });
  const margin = 96;
  const contentWidth = 1536 - margin * 2;
  const lineHeight = 42;
  let y = margin;

  context.fillStyle = getThemeColor('--color-export-canvas-background');
  context.fillRect(0, 0, 1536, 2048);
  context.fillStyle = getThemeColor('--color-heading');
  context.font = 'bold 52px sans-serif';
  y = drawWrappedCanvasText(context, meta.sortie || t('export.canvas.briefing'), margin, y, contentWidth, lineHeight + 12);

  context.fillStyle = getThemeColor('--color-text-tertiary');
  context.font = '28px sans-serif';
  y += 24;
  const lines = hasBriefingSection(settings.briefingSections, 'overview') ? [
    t('export.canvas.map', { value: meta.theatre }),
    t('export.canvas.date', { value: formatDateYMD(localDate) }),
    t('export.canvas.local', { value: `${formatTimeHHMM(localDate)} (${formatUtcOffset(meta.utcOffset)})` }),
    t('export.canvas.zulu', { value: `${formatTimeHHMM(zuluDate)}Z` }),
    '',
    t('export.canvas.weather'),
    t('export.canvas.temperature', { value: formatTemperature(weather.temperature, settings.temperatureUnit) }),
    t('export.canvas.qnh', { value: formatPressure(weather.qnh, settings.pressureUnit) }),
    t('export.canvas.visibility', { value: formatDistance(weather.visibility, settings.distanceUnit) }),
    t('export.canvas.clouds', { value: weather.clouds.label }),
    t('export.canvas.metar', { value: metar }),
  ] : [];

  lines.forEach(line => {
    y = drawWrappedCanvasText(context, line, margin, y, contentWidth, lineHeight);
  });

  if (hasBriefingSection(settings.briefingSections, 'whiteboard')) {
    y += 24;
    context.fillStyle = getThemeColor('--color-heading');
    context.font = 'bold 34px sans-serif';
    y = drawWrappedCanvasText(context, t('export.markdown.whiteboard'), margin, y, contentWidth, lineHeight + 4);
    context.fillStyle = getThemeColor('--color-text-tertiary');
    context.font = '26px sans-serif';
    const notes = whiteboard.notes.trim() || t('export.markdown.noWhiteboardNotes');
    y = drawWrappedCanvasText(context, notes, margin, y, contentWidth, 36);

    if (whiteboard.strokes.length > 0 && y < 1900) {
      y += 20;
      drawWhiteboardSummary(context, whiteboard, margin, y, contentWidth, Math.min(620, 1980 - y));
    }
  }
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

function drawWrappedCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  if (!text) return y + lineHeight;

  let line = '';
  for (const character of Array.from(text)) {
    const candidate = line + character;
    if (line && context.measureText(candidate).width > maxWidth) {
      context.fillText(line, x, y);
      y += lineHeight;
      line = character;
    } else {
      line = candidate;
    }
  }

  if (line) {
    context.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise(resolve => {
    canvas.toBlob(resolve, 'image/png');
  });
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
