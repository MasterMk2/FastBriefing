import type { MissionData, DisplaySettings } from '../types/mission';

interface CommsTabProps {
  mission: MissionData;
  settings: DisplaySettings;
}

export default function CommsTab({ mission, settings }: CommsTabProps) {
  void settings;
  const allFlights = [...mission.coalitions.blue.flights, ...mission.coalitions.red.flights];
  const allSupport = [...mission.coalitions.blue.support, ...mission.coalitions.red.support];
  
  const flightFreqs = allFlights.flatMap(f => 
    f.units.flatMap(u => u.radios.map(r => ({
      callsign: f.callsign,
      flight: f.name,
      side: mission.coalitions.blue.flights.includes(f) ? 'Blue' : 'Red',
      channel: r.channel,
      frequency: r.frequency,
      modulation: r.modulation === 0 ? 'AM' : 'FM',
      name: r.name,
    })))
  );
  
  const supportFreqs = allSupport.flatMap(s => 
    s.frequency ? [{
      callsign: s.callsign,
      flight: s.kind,
      side: 'Support',
      channel: 0,
      frequency: s.frequency / 1000000,
      modulation: 'AM',
      name: s.kind,
    }] : []
  );
  
  const allFreqs = [...flightFreqs, ...supportFreqs].sort((a, b) => a.frequency - b.frequency);
  
  const freqGroups = allFreqs.reduce((acc, f) => {
    const key = f.frequency.toFixed(3);
    if (!acc[key]) acc[key] = [];
    acc[key].push(f);
    return acc;
  }, {} as Record<string, typeof allFreqs>);
  
  const sharedFreqs = Object.entries(freqGroups).filter(([_, v]) => v.length > 1);
  
  return (
    <div className="tab-panel comms">
      {sharedFreqs.length > 0 && (
        <section className="section warning">
          <h3>⚠️ 共有周波数 (重複)</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>周波数</th>
                <th>使用者</th>
              </tr>
            </thead>
            <tbody>
              {sharedFreqs.map(([freq, users]) => (
                <tr key={freq}>
                  <td>{freq} MHz</td>
                  <td>{users.map(u => `${u.side} ${u.callsign} (CH${u.channel}: ${u.name})`).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      
      <section className="section">
        <h3>フライト通信計画</h3>
        {allFlights.map(flight => (
          <div key={flight.groupId} className="flight-comms">
            <h4>
              <span className={`side-badge ${mission.coalitions.blue.flights.includes(flight) ? 'blue' : 'red'}`}>
                {mission.coalitions.blue.flights.includes(flight) ? 'Blue' : 'Red'}
              </span>
              {flight.callsign} - {flight.name} ({flight.type})
            </h4>
            <p>グループ周波数: {flight.frequency / 1000000} MHz ({flight.modulation === 0 ? 'AM' : 'FM'})</p>
            <table className="data-table small">
              <thead>
                <tr>
                  <th>CH</th>
                  <th>周波数 (MHz)</th>
                  <th>変調</th>
                  <th>名称</th>
                </tr>
              </thead>
              <tbody>
                {flight.units[0].radios.map(radio => (
                  <tr key={radio.channel}>
                    <td>{radio.channel}</td>
                    <td>{radio.frequency.toFixed(3)}</td>
                    <td>{radio.modulation === 0 ? 'AM' : 'FM'}</td>
                    <td>{radio.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>
      
      <section className="section">
        <h3>支援機周波数</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>種類</th>
              <th>コールサイン</th>
              <th>周波数 (MHz)</th>
              <th>TACAN</th>
            </tr>
          </thead>
          <tbody>
            {allSupport.map(s => (
              <tr key={s.callsign}>
                <td>{s.kind}</td>
                <td>{s.callsign}</td>
                <td>{s.frequency ? (s.frequency / 1000000).toFixed(3) : '-'}</td>
                <td>{s.tacan?.channel || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      
      <section className="section">
        <h3>共通周波数</h3>
        <dl className="info-grid">
          <dt>Guard (UHF)</dt>
          <dd>243.000 MHz (AM)</dd>
          <dt>Guard (VHF)</dt>
          <dd>121.500 MHz (AM)</dd>
        </dl>
      </section>
    </div>
  );
}