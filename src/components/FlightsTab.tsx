import React, { useState } from 'react';
import type { MissionData, DisplaySettings, Flight } from '../types/mission';
import { formatAltitude, formatSpeed, formatDistance } from '../utils/units';

interface FlightsTabProps {
  mission: MissionData;
  settings: DisplaySettings;
}

export default function FlightsTab({ mission, settings }: FlightsTabProps) {
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [side, setSide] = useState<'blue' | 'red'>('blue');
  
  const flights = side === 'blue' ? mission.coalitions.blue.flights : mission.coalitions.red.flights;
  
  return (
    <div className="tab-panel flights">
      <div className="flights-header">
        <div className="side-selector">
          <button className={side === 'blue' ? 'active' : ''} onClick={() => setSide('blue')}>青側</button>
          <button className={side === 'red' ? 'active' : ''} onClick={() => setSide('red')}>赤側</button>
        </div>
      </div>
      
      <div className="flights-layout">
        <aside className="flight-list">
          {flights.map(flight => (
            <button
              key={flight.groupId}
              className={`flight-item ${selectedFlight?.groupId === flight.groupId ? 'selected' : ''}`}
              onClick={() => setSelectedFlight(flight)}
            >
              <div className="flight-name">{flight.name}</div>
              <div className="flight-details">
                <span>{flight.type}</span>
                <span>×{flight.units.length}</span>
                <span className="callsign">{flight.callsign}</span>
              </div>
            </button>
          ))}
        </aside>
        
        {selectedFlight && (
          <main className="flight-detail">
            <FlightDetail flight={selectedFlight} settings={settings} startTime={mission.meta.startTime} />
          </main>
        )}
        
        {!selectedFlight && flights.length > 0 && (
          <main className="flight-detail empty">
            <p>フライトを選択して詳細を表示</p>
          </main>
        )}
        
        {flights.length === 0 && (
          <main className="flight-detail empty">
            <p>この勢力にフライトがありません</p>
          </main>
        )}
      </div>
    </div>
  );
}

function FlightDetail({ flight, settings, startTime }: { flight: Flight; settings: DisplaySettings; startTime: number }) {
  const leadUnit = flight.units[0];
  
  return (
    <div className="flight-detail-content">
      <header className="flight-header">
        <h2>{flight.name}</h2>
        <div className="flight-meta">
          <span className="badge">{flight.type}</span>
          <span className="badge">{flight.units.length}機</span>
          <span className="badge callsign">{flight.callsign}</span>
          <span className="badge task">{flight.task}</span>
          {flight.hidden && <span className="badge hidden">Hidden</span>}
        </div>
      </header>
      
      <section className="section">
        <h3>機体構成</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>機番</th>
              <th>コールサイン</th>
              <th>スキル</th>
              <th>スキン</th>
              <th>燃料</th>
              <th>チャフ/フレア</th>
            </tr>
          </thead>
          <tbody>
            {flight.units.map((unit, i) => (
              <tr key={unit.unitId}>
                <td>{i + 1}</td>
                <td>{unit.tailNumber || `-`}</td>
                <td>{unit.name}</td>
                <td>{unit.skill}</td>
                <td>{unit.livery || `-`}</td>
                <td>{unit.payload.fuel} kg</td>
                <td>{unit.payload.chaff} / {unit.payload.flare}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      
      <section className="section">
        <h3>搭載</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>ステーション</th>
              <th>兵装</th>
              <th>数</th>
            </tr>
          </thead>
          <tbody>
            {leadUnit.payload.pylons.map((pylon, i) => (
              <tr key={i}>
                <td>{pylon.station}</td>
                <td>{pylon.name}</td>
                <td>{pylon.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      
      <section className="section">
        <h3>無線プリセット</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>CH</th>
              <th>周波数</th>
              <th>変調</th>
              <th>名称</th>
            </tr>
          </thead>
          <tbody>
            {leadUnit.radios.map(radio => (
              <tr key={radio.channel}>
                <td>{radio.channel}</td>
                <td>{radio.frequency.toFixed(3)} MHz</td>
                <td>{radio.modulation === 0 ? 'AM' : 'FM'}</td>
                <td>{radio.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      
      <section className="section">
        <h3>経路 (ナビログ)</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>名称</th>
              <th>種別</th>
              <th>座標</th>
              <th>高度</th>
              <th>速度</th>
              <th>ETA</th>
              <th>距離</th>
              <th>方位</th>
            </tr>
          </thead>
          <tbody>
            {flight.route.map((wp) => (
              <tr key={wp.index}>
                <td>{wp.index}</td>
                <td>{wp.name}</td>
                <td>{wp.action}</td>
                <td>{wp.latlon[0].toFixed(4)}, {wp.latlon[1].toFixed(4)}</td>
                <td>{formatAltitude(wp.alt, settings.altitudeUnit)}</td>
                <td>{formatSpeed(wp.speed, settings.speedUnit)}</td>
                <td>{formatETA(wp.eta, startTime)}</td>
                <td>{wp.leg ? formatDistance(wp.leg.distance, settings.distanceUnit) : '-'}</td>
                <td>{wp.leg ? `${wp.leg.trueBearing.toFixed(0)}°T / ${wp.leg.magneticBearing.toFixed(0)}°M` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      
      {leadUnit.props && Object.keys(leadUnit.props).length > 0 && (
        <section className="section">
          <h3>機種固有設定 (AddPropAircraft)</h3>
          <dl className="info-grid">
            {Object.entries(leadUnit.props).map(([key, value]) => (
              <React.Fragment key={key}>
                <dt>{key}</dt>
                <dd>{JSON.stringify(value)}</dd>
              </React.Fragment>
            ))}
          </dl>
        </section>
      )}
      
      {leadUnit.datalink?.link16 && (
        <section className="section">
          <h3>データリンク (Link 16)</h3>
          <dl className="info-grid">
            <dt>フライトリード</dt>
            <dd>{leadUnit.datalink.link16.flightLead ? 'Yes' : 'No'}</dd>
            <dt>チーム</dt>
            <dd>{leadUnit.datalink.link16.team}</dd>
          </dl>
        </section>
      )}
    </div>
  );
}

function formatETA(eta: number, startTime: number): string {
  const date = new Date((startTime + eta) * 1000);
  return date.toISOString().slice(11, 19) + 'Z';
}