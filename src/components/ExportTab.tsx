import { useState } from 'react';
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

interface ExportTabProps {
  mission: MissionData;
  settings: DisplaySettings;
}

export default function ExportTab({ mission, settings }: ExportTabProps) {
  const [markdown, setMarkdown] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [pngStatus, setPngStatus] = useState('');

  const generateMarkdown = () => {
    const { meta, weather, coalitions } = mission;
    const localDate = missionLocalDate(meta);
    const zuluDate = missionZuluDate(meta);
    const metar = buildMetar(weather, { time: zuluDate });
    let md = '';

    md += `# ${meta.sortie}\n\n`;
    md += `**マップ**: ${meta.theatre}  \n`;
    md += `**日付**: ${formatDateYMD(localDate)}  \n`;
    md += `**開始時刻 (Local)**: ${formatTimeHHMM(localDate)} (${formatUtcOffset(meta.utcOffset)})  \n`;
    md += `**開始時刻 (Zulu)**: ${formatTimeHHMM(zuluDate)}Z  \n\n`;

    md += `## 天候\n\n`;
    md += `- **気温**: ${formatTemperature(weather.temperature, settings.temperatureUnit)}  \n`;
    md += `- **QNH**: ${formatPressure(weather.qnh, settings.pressureUnit)}  \n`;
    md += `- **視程**: ${formatDistance(weather.visibility, settings.distanceUnit)}  \n`;
    md += `- **雲**: ${weather.clouds.label} (底: ${formatAltitude(weather.clouds.base, settings.altitudeUnit)})  \n`;
    md += `- **METAR**: ${metar}  \n`;
    md += '\n### 風\n\n';
    md += '| 高度 | 風向 (FROM) | 風速 |\n|------|-------------|------|\n';
    weather.wind.forEach(w => {
      md += `| ${w.level === 'ground' ? '地上' : w.level === '2000' ? '2000m' : '8000m'} | ${w.from}° | ${formatSpeed(w.speed, settings.speedUnit)} |\n`;
    });
    md += '\n';

    md += `## フライト一覧\n\n`;
    [...coalitions.blue.flights, ...coalitions.red.flights].forEach(flight => {
      const side = coalitions.blue.flights.includes(flight) ? 'Blue' : 'Red';
      md += `### ${side} - ${flight.callsign} (${flight.name}) [${flight.type} ×${flight.units.length}]\n\n`;
      md += `- **Task**: ${flight.task}\n`;
      md += `- **グループ周波数**: ${(flight.frequency / 1000000).toFixed(3)} MHz (${flight.modulation === 0 ? 'AM' : 'FM'})\n\n`;

      md += `#### 経路\n\n`;
      md += '| # | 名称 | 種別 | 座標 | 高度 | 速度 | ETA |\n|---|------|------|------|------|------|-----|\n';
      flight.route.forEach(wp => {
        const coordinate = formatCoordinate(wp.latlon[0], wp.latlon[1], settings.coordinateFormat);
        md += `| ${wp.index} | ${wp.name} | ${wp.action} | ${coordinate} | ${formatAltitude(wp.alt, settings.altitudeUnit)} | ${formatSpeed(wp.speed, settings.speedUnit)} | ${formatETA(wp.eta, meta)} |\n`;
      });
      md += '\n';

      md += `#### 無線プリセット\n\n`;
      md += '| CH | 周波数 (MHz) | 変調 | 名称 |\n|----|--------------|------|------|\n';
      flight.units[0].radios.forEach(radio => {
        md += `| ${radio.channel} | ${radio.frequency.toFixed(3)} | ${radio.modulation === 0 ? 'AM' : 'FM'} | ${radio.name} |\n`;
      });
      md += '\n';
    });

    md += `## 支援機\n\n`;
    [...coalitions.blue.support, ...coalitions.red.support].forEach(s => {
      md += `- **${s.kind.toUpperCase()}**: ${s.callsign}`;
      if (s.frequency) md += ` - ${(s.frequency / 1000000).toFixed(3)} MHz`;
      if (s.tacan) md += ` - TACAN ${s.tacan.channel}`;
      md += '\n';
    });
    md += '\n';

    md += `## 通信計画 (コムカード)\n\n`;
    md += '| コールサイン | 側 | CH | 周波数 (MHz) | 変調 | 名称 |\n|--------------|----|----|--------------|------|------|\n';
    [...coalitions.blue.flights, ...coalitions.red.flights].forEach(flight => {
      const side = coalitions.blue.flights.includes(flight) ? 'Blue' : 'Red';
      flight.units[0].radios.forEach(radio => {
        md += `| ${flight.callsign} | ${side} | ${radio.channel} | ${radio.frequency.toFixed(3)} | ${radio.modulation === 0 ? 'AM' : 'FM'} | ${radio.name} |\n`;
      });
    });
    md += '| Guard (UHF) | All | - | 243.000 | AM | Guard |\n';
    md += '| Guard (VHF) | All | - | 121.500 | AM | Guard |\n';

    setMarkdown(md);
    setCopyStatus('');
  };

  const copyMarkdown = async () => {
    if (!markdown) return;

    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(markdown);
      setCopyStatus('Markdownをコピーしました');
    } catch {
      setCopyStatus('コピーに失敗しました（ブラウザの権限を確認してください）');
    }
  };

  const printBriefing = () => {
    window.print();
  };

  const exportPng = async () => {
    setPngStatus('PNGを生成中…');

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1536;
      canvas.height = 2048;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context unavailable');

      drawBriefingSummary(context, mission, settings);
      const blob = await canvasToBlob(canvas);
      if (!blob) throw new Error('PNG blob unavailable');

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${safeFilename(mission.meta.sortie || 'briefing')}-briefing.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      setPngStatus('PNGを保存しました');
    } catch {
      setPngStatus('PNG生成に失敗しました');
    }
  };

  return (
    <div className="tab-panel export">
      <div className="export-actions">
        <button onClick={generateMarkdown} className="btn btn-primary">Markdown生成</button>
        <button onClick={copyMarkdown} className="btn" disabled={!markdown}>コピー</button>
        <button onClick={printBriefing} className="btn btn-secondary">印刷 / PDF</button>
        <button onClick={exportPng} className="btn btn-secondary">PNG生成</button>
        {copyStatus && <span className="hint" role="status">{copyStatus}</span>}
        {pngStatus && <span className="hint" role="status">{pngStatus}</span>}
      </div>

      {markdown && (
        <div className="markdown-preview">
          <h3>プレビュー</h3>
          <pre>{markdown}</pre>
        </div>
      )}

      <section className="section export-help">
        <h3>印刷・画像出力</h3>
        <p>印刷用レイアウトには概要、フライト、地図、通信、支援機、脅威の各セクションが含まれます。ブラウザの印刷機能（Ctrl+P）で PDF として保存できます。</p>
        <p className="hint">PNG はブリーフィング要約を 1536×2048 のキャンバスに描画して保存します。.miz への埋め込みは未対応です。</p>
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
  y = drawWrappedCanvasText(context, meta.sortie || 'Briefing', margin, y, contentWidth, lineHeight + 12);

  context.fillStyle = '#555555';
  context.font = '28px sans-serif';
  y += 24;
  const lines = [
    `マップ: ${meta.theatre}`,
    `日付: ${formatDateYMD(localDate)}`,
    `Local: ${formatTimeHHMM(localDate)} (${formatUtcOffset(meta.utcOffset)})`,
    `Zulu: ${formatTimeHHMM(zuluDate)}Z`,
    '',
    '天候',
    `気温: ${formatTemperature(weather.temperature, settings.temperatureUnit)}`,
    `QNH: ${formatPressure(weather.qnh, settings.pressureUnit)}`,
    `視程: ${formatDistance(weather.visibility, settings.distanceUnit)}`,
    `雲: ${weather.clouds.label}`,
    `METAR: ${metar}`,
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
