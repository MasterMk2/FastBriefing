import { useState } from 'react';
import type { MissionData, DisplaySettings } from '../types/mission';
import { formatAltitude, formatSpeed, formatDistance, formatPressure, formatTemperature } from '../utils/coordinates';

interface ExportTabProps {
  mission: MissionData;
  settings: DisplaySettings;
}

export default function ExportTab({ mission, settings }: ExportTabProps) {
  const [markdown, setMarkdown] = useState('');
  
  const generateMarkdown = () => {
    const { meta, weather, coalitions } = mission;
    let md = '';
    
    md += `# ${meta.sortie}\n\n`;
    md += `**マップ**: ${meta.theatre}  \n`;
    md += `**日付**: ${meta.date.Year}-${String(meta.date.Month).padStart(2, '0')}-${String(meta.date.Day).padStart(2, '0')}  \n`;
    md += `**開始時刻 (Local)**: ${new Date(meta.date.Year, meta.date.Month - 1, meta.date.Day, Math.floor(meta.startTime / 3600), Math.floor((meta.startTime % 3600) / 60)).toLocaleString()}  \n`;
    md += `**開始時刻 (Zulu)**: ${new Date(meta.date.Year, meta.date.Month - 1, meta.date.Day, Math.floor(meta.startTime / 3600) - meta.utcOffset, Math.floor((meta.startTime % 3600) / 60)).toISOString().slice(11, 16)}Z  \n\n`;
    
    md += `## 天候\n\n`;
    md += `- **気温**: ${formatTemperature(weather.temperature, settings.temperatureUnit)}  \n`;
    md += `- **QNH**: ${formatPressure(weather.qnh.mmHg, settings.pressureUnit)}  \n`;
    md += `- **視程**: ${formatDistance(weather.visibility, settings.distanceUnit)}  \n`;
    md += `- **雲**: ${weather.clouds.label} (底: ${formatAltitude(weather.clouds.base, settings.altitudeUnit)})  \n`;
    md += `\n### 風\n\n`;
    md += `| 高度 | 風向 (FROM) | 風速 |\n|------|-------------|------|\n`;
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
      md += `| # | 名称 | 種別 | 座標 | 高度 | 速度 | ETA |\n|---|------|------|------|------|------|-----|\n`;
      flight.route.forEach(wp => {
        md += `| ${wp.index} | ${wp.name} | ${wp.action} | ${wp.latlon[0].toFixed(4)}, ${wp.latlon[1].toFixed(4)} | ${formatAltitude(wp.alt, settings.altitudeUnit)} | ${formatSpeed(wp.speed, settings.speedUnit)} | ${formatETA(wp.eta, meta.startTime)} |\n`;
      });
      md += '\n';
      
      md += `#### 無線プリセット\n\n`;
      md += `| CH | 周波数 (MHz) | 変調 | 名称 |\n|----|--------------|------|------|\n`;
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
    md += `| コールサイン | 側 | CH | 周波数 (MHz) | 変調 | 名称 |\n|--------------|----|----|--------------|------|------|\n`;
    [...coalitions.blue.flights, ...coalitions.red.flights].forEach(flight => {
      const side = coalitions.blue.flights.includes(flight) ? 'Blue' : 'Red';
      flight.units[0].radios.forEach(radio => {
        md += `| ${flight.callsign} | ${side} | ${radio.channel} | ${radio.frequency.toFixed(3)} | ${radio.modulation === 0 ? 'AM' : 'FM'} | ${radio.name} |\n`;
      });
    });
    md += `| Guard (UHF) | All | - | 243.000 | AM | Guard |\n`;
    md += `| Guard (VHF) | All | - | 121.500 | AM | Guard |\n`;
    
    setMarkdown(md);
  };
  
  const copyMarkdown = () => {
    navigator.clipboard.writeText(markdown);
    alert('Markdownをクリップボードにコピーしました');
  };
  
  const printBriefing = () => {
    window.print();
  };
  
  return (
    <div className="tab-panel export">
      <div className="export-actions">
        <button onClick={generateMarkdown} className="btn btn-primary">Markdown生成</button>
        <button onClick={copyMarkdown} className="btn" disabled={!markdown}>コピー</button>
        <button onClick={printBriefing} className="btn btn-secondary">印刷 / PDF</button>
      </div>
      
      {markdown && (
        <div className="markdown-preview">
          <h3>プレビュー</h3>
          <pre>{markdown}</pre>
        </div>
      )}
      
      <section className="section">
        <h3>印刷用CSSについて</h3>
        <p>ブラウザの印刷機能（Ctrl+P）を使用してPDFとして保存できます。A4縦向きで最適化されています。</p>
        <p className="hint">ニーボード用PNG出力と.miz埋め込みはPhase 2で実装予定です。</p>
      </section>
    </div>
  );
}

function formatETA(eta: number, startTime: number): string {
  const date = new Date((startTime + eta) * 1000);
  return date.toISOString().slice(11, 19) + 'Z';
}