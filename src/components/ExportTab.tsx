import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { MissionData, DisplaySettings, MissionMeta } from '../types/mission';
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
import OverviewTab from './OverviewTab';
import FlightsTab from './FlightsTab';
import MapTab from './MapTab';
import CommsTab from './CommsTab';
import SupportTab from './SupportTab';
import ThreatsTab from './ThreatsTab';
import { useSettings } from '../hooks/useSettings';

interface ExportTabProps {
  mission: MissionData;
  settings: DisplaySettings;
}

export default function ExportTab({ mission, settings }: ExportTabProps) {
  const { t } = useTranslation();
  const { setOutputLanguage } = useSettings();
  const [markdown, setMarkdown] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [pngStatus, setPngStatus] = useState('');

  const outputT = (key: string, options?: Record<string, string | number>) => t(key, {
    ...options,
    lng: settings.outputLanguage,
  });

  const generateMarkdown = () => {
    const { meta, weather, coalitions } = mission;
    const localDate = missionLocalDate(meta);
    const zuluDate = missionZuluDate(meta);
    const metar = buildMetar(weather, { time: zuluDate });
    let md = '';

    md += `# ${meta.sortie}\n\n`;
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

    md += `## ${outputT('export.markdown.support')}\n\n`;
    [...coalitions.blue.support, ...coalitions.red.support].forEach(s => {
      md += `- **${s.kind.toUpperCase()}**: ${s.callsign}`;
      if (s.frequency) md += ` - ${(s.frequency / 1000000).toFixed(3)} MHz`;
      if (s.tacan) md += ` - TACAN ${s.tacan.channel}`;
      md += '\n';
    });
    md += '\n';

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

  const exportPng = async () => {
    setPngStatus(t('export.pngGenerating'));

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1536;
      canvas.height = 2048;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context unavailable');

      drawBriefingSummary(context, mission, settings, t);
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

      <div className="print-briefing" aria-hidden="true">
        <OverviewTab mission={mission} settings={settings} />
        <FlightsTab mission={mission} settings={settings} />
        <MapTab mission={mission} settings={settings} />
        <CommsTab mission={mission} settings={settings} />
        <SupportTab mission={mission} settings={settings} />
        <ThreatsTab mission={mission} settings={settings} />
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
  t: TFunction,
): void {
  const { meta, weather } = mission;
  const localDate = missionLocalDate(meta);
  const zuluDate = missionZuluDate(meta);
  const metar = buildMetar(weather, { time: zuluDate });
  const margin = 96;
  const contentWidth = 1536 - margin * 2;
  const lineHeight = 42;
  let y = margin;

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 1536, 2048);
  context.fillStyle = '#1a1a1a';
  context.font = 'bold 52px sans-serif';
  y = drawWrappedCanvasText(context, meta.sortie || t('export.canvas.briefing'), margin, y, contentWidth, lineHeight + 12);

  context.fillStyle = '#555555';
  context.font = '28px sans-serif';
  y += 24;
  const lines = [
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
  ];

  lines.forEach(line => {
    y = drawWrappedCanvasText(context, line, margin, y, contentWidth, lineHeight);
  });
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
