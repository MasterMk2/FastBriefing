import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { MissionData, DisplaySettings, Flight, MissionMeta } from '../types/mission';
import { calculateBearing, formatCoordinate, getDefaultCoordinateFormat } from '../utils/coordinates';
import { getMagneticVariation, trueToMagnetic } from '../utils/magvar';
import { formatEtaLocal, formatEtaZulu, missionZuluDate } from '../utils/time';
import { formatAltitude, formatSpeed, formatDistance } from '../utils/units';

interface FlightsTabProps {
  mission: MissionData;
  settings: DisplaySettings;
}

export default function FlightsTab({ mission, settings }: FlightsTabProps) {
  const { t } = useTranslation();
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [side, setSide] = useState<'blue' | 'red'>('blue');
  
  const flights = side === 'blue' ? mission.coalitions.blue.flights : mission.coalitions.red.flights;
  
  return (
    <div className="tab-panel flights">
      <div className="flights-header">
        <div className="side-selector">
          <button className={side === 'blue' ? 'active' : ''} onClick={() => setSide('blue')}>{t('flights.selectBlue')}</button>
          <button className={side === 'red' ? 'active' : ''} onClick={() => setSide('red')}>{t('flights.selectRed')}</button>
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
            <FlightDetail flight={selectedFlight} settings={settings} meta={mission.meta} />
          </main>
        )}
        
        {!selectedFlight && flights.length > 0 && (
          <main className="flight-detail empty">
            <p>{t('flights.selectPrompt')}</p>
          </main>
        )}
        
        {flights.length === 0 && (
          <main className="flight-detail empty">
            <p>{t('flights.empty')}</p>
          </main>
        )}
      </div>
    </div>
  );
}

function FlightDetail({ flight, settings, meta }: { flight: Flight; settings: DisplaySettings; meta: MissionMeta }) {
  const { t } = useTranslation();
  const leadUnit = flight.units[0];
  const aircraftDefaultCoordinateFormat = getDefaultCoordinateFormat(flight.type);
  const missionDate = missionZuluDate(meta);
  
  return (
    <div className="flight-detail-content">
      <header className="flight-header">
        <h2>{flight.name}</h2>
        <div className="flight-meta">
          <span className="badge">{flight.type}</span>
          <span className="badge">{t('flights.unitCount', { count: flight.units.length })}</span>
          <span className="badge callsign">{flight.callsign}</span>
          <span className="badge task">{flight.task}</span>
          {flight.hidden && <span className="badge hidden">{t('flights.hidden')}</span>}
        </div>
      </header>
      
      <section className="section">
        <h3>{t('flights.aircraftRoster')}</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>{t('flights.number')}</th>
              <th>{t('flights.callsign')}</th>
              <th>{t('flights.skill')}</th>
              <th>{t('flights.livery')}</th>
              <th>{t('flights.fuel')}</th>
              <th>{t('flights.chaffFlare')}</th>
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
                <td>{t('flights.fuelAmount', { value: unit.payload.fuel })}</td>
                <td>{unit.payload.chaff} / {unit.payload.flare}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      
      <section className="section">
        <h3>{t('flights.loadout')}</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('flights.station')}</th>
              <th>{t('flights.weapon')}</th>
              <th>{t('flights.count')}</th>
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
        <h3>{t('flights.radioPreset')}</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>CH</th>
              <th>{t('flights.frequency')}</th>
              <th>{t('flights.modulation')}</th>
              <th>{t('flights.name')}</th>
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
        <h3>{t('flights.route')}</h3>
        <p className="coordinate-note" title={t('flights.coordinateNoteTitle')}>
          {t('flights.coordinateFormat', { format: settings.coordinateFormat, defaultFormat: aircraftDefaultCoordinateFormat })}
        </p>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>{t('flights.name')}</th>
              <th>{t('flights.type')}</th>
              <th>{t('flights.coordinate')}</th>
              <th>{t('flights.altitude')}</th>
              <th>{t('flights.speed')}</th>
              <th>{t('flights.eta')}</th>
              <th>{t('flights.distance')}</th>
              <th title={t('flights.bearingTitle')}>{t('flights.bearing')}</th>
            </tr>
          </thead>
          <tbody>
            {flight.route.map((wp, routeIndex) => {
              const bearing = getDisplayedBearing(flight.route, routeIndex, meta, missionDate);
              return (
              <tr key={wp.index}>
                <td>{wp.index}</td>
                <td>{wp.name}</td>
                <td>{wp.action}</td>
                <td>{formatCoordinate(wp.latlon[0], wp.latlon[1], settings.coordinateFormat)}</td>
                <td>{formatAltitude(wp.alt, settings.altitudeUnit)}</td>
                <td>{formatSpeed(wp.speed, settings.speedUnit)}</td>
                <td>{formatETA(wp.eta, meta, t)}</td>
                <td>{wp.leg ? formatDistance(wp.leg.distance, settings.distanceUnit) : '-'}</td>
                <td>{bearing ? t('flights.bearingValue', { trueBearing: bearing.trueBearing.toFixed(0), magneticBearing: bearing.magneticBearing.toFixed(0) }) : '-'}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      
      {leadUnit.props && Object.keys(leadUnit.props).length > 0 && (
        <section className="section">
          <h3>{t('flights.aircraftSettings')}</h3>
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
          <h3>{t('flights.datalink')}</h3>
          <dl className="info-grid">
            <dt>{t('flights.flightLead')}</dt>
            <dd>{leadUnit.datalink.link16.flightLead ? t('common.yes') : t('common.no')}</dd>
            <dt>{t('flights.team')}</dt>
            <dd>{leadUnit.datalink.link16.team}</dd>
          </dl>
        </section>
      )}
    </div>
  );
}

function formatETA(eta: number, meta: MissionMeta, t: TFunction): string {
  return t('flights.etaValue', {
    localTime: formatEtaLocal(meta, eta),
    zuluTime: formatEtaZulu(meta, eta),
  });
}

interface DisplayBearing {
  trueBearing: number;
  magneticBearing: number;
}

function getDisplayedBearing(
  route: Flight['route'],
  routeIndex: number,
  meta: MissionMeta,
  missionDate: Date,
): DisplayBearing | null {
  const waypoint = route[routeIndex];
  const previousWaypoint = route[routeIndex - 1];
  if (!waypoint || !previousWaypoint) {
    return null;
  }

  const [fromLat, fromLon] = previousWaypoint.latlon;
  const [toLat, toLon] = waypoint.latlon;
  if (![fromLat, fromLon, toLat, toLon].every(Number.isFinite)) {
    return null;
  }

  const trueBearing = calculateBearing(fromLat, fromLon, toLat, toLon);
  if (!Number.isFinite(trueBearing)) {
    return null;
  }

  const variation = getMagneticVariation(meta.theatre, toLat, toLon, missionDate);
  return {
    trueBearing,
    magneticBearing: trueToMagnetic(trueBearing, variation),
  };
}
