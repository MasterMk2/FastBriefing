import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { MissionData, DisplaySettings, Flight, MissionMeta, UserNotes } from '../types/mission';
import { getDefaultCoordinateFormat } from '../utils/coordinates';
import { formatEtaLocal, formatEtaZulu } from '../utils/time';
import { formatAltitude, formatSpeed, formatDistance } from '../utils/units';
import { applyViewMode } from '../utils/viewMode';
import { formatLegDuration, formatRouteCoordinate } from '../utils/routeLegs';
import WaypointAnnotationEditor from './WaypointAnnotationEditor';

interface FlightsTabProps {
  mission: MissionData;
  settings: DisplaySettings;
  onNotesChange?: (notes: UserNotes) => void;
}

export default function FlightsTab({ mission, settings, onNotesChange }: FlightsTabProps) {
  const { t } = useTranslation();
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [side, setSide] = useState<'blue' | 'red'>('blue');
  const viewMission = useMemo(() => applyViewMode(mission, settings.viewMode), [mission, settings.viewMode]);
  const flights = side === 'blue' ? viewMission.coalitions.blue.flights : viewMission.coalitions.red.flights;
  const visibleSelectedFlight = selectedFlight && flights.includes(selectedFlight) ? selectedFlight : null;
  
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
        
        {visibleSelectedFlight && (
          <main className="flight-detail">
            <FlightDetail
              flight={visibleSelectedFlight}
              side={side}
              mission={viewMission}
              settings={settings}
              meta={viewMission.meta}
              onNotesChange={onNotesChange}
            />
          </main>
        )}
        
        {!visibleSelectedFlight && flights.length > 0 && (
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

function FlightDetail({ flight, side, mission, settings, meta, onNotesChange }: {
  flight: Flight;
  side: 'blue' | 'red';
  mission: MissionData;
  settings: DisplaySettings;
  meta: MissionMeta;
  onNotesChange?: (notes: UserNotes) => void;
}) {
  const { t } = useTranslation();
  const leadUnit = flight.units[0];
  const aircraftDefaultCoordinateFormat = getDefaultCoordinateFormat(flight.type);
  
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
        <div className="flight-route-scroll">
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
              <th>{t('flights.legTime')}</th>
              <th>{t('flights.cumulativeDistance')}</th>
              <th>{t('flights.cumulativeTime')}</th>
              {onNotesChange && <th>{t('waypoints.annotation')}</th>}
            </tr>
          </thead>
          <tbody>
            {flight.route.map((wp, routeIndex) => (
              <tr key={`${wp.index}:${routeIndex}`}>
                <td>{wp.index}</td>
                <td>{wp.name}</td>
                <td>{wp.action}</td>
                <td>{formatRouteCoordinate(wp, settings.coordinateFormat)}</td>
                <td>{formatAltitude(wp.alt, settings.altitudeUnit)}</td>
                <td>{formatSpeed(wp.speed, settings.speedUnit)}</td>
                <td>{formatETA(wp.eta, meta, t)}</td>
                <td>{wp.leg ? formatDistance(wp.leg.distance, settings.distanceUnit) : '-'}</td>
                <td>{wp.leg ? wp.leg.magneticBearing === undefined
                  ? t('flights.trueBearingOnly', { trueBearing: wp.leg.trueBearing.toFixed(0) })
                  : t('flights.bearingValue', { trueBearing: wp.leg.trueBearing.toFixed(0), magneticBearing: wp.leg.magneticBearing.toFixed(0) }) : '-'}</td>
                <td>{formatLegDuration(wp.leg?.time)}</td>
                <td>{wp.leg ? formatDistance(wp.leg.cumulativeDistance, settings.distanceUnit) : '-'}</td>
                <td>{formatLegDuration(wp.leg?.cumulativeTime)}</td>
                {onNotesChange && (
                  <td className="waypoint-editor-cell">
                    <WaypointAnnotationEditor
                      mission={mission}
                      side={side}
                      flight={flight}
                      routeIndex={routeIndex}
                      onNotesChange={onNotesChange}
                      compact
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
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
