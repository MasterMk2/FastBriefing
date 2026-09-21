import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AIGroup, DisplaySettings, Flight, FlightNotes, MissionData, MissionMeta, SMEACNotes, SupportAsset } from '../types/mission';
import type { WhiteboardData } from '../types/whiteboard';
import { dcsToLatLon, formatCoordinate, getDefaultCoordinateFormat } from '../utils/coordinates';
import { formatAltitude, formatDistance, formatPressure, formatSpeed, formatTemperature } from '../utils/units';
import { getMoonInfo, getSunTimes, type SunTimes } from '../utils/astro';
import { buildMetar } from '../utils/metar';
import { addSeconds, formatDateYMD, formatEtaLocal, formatEtaZulu, formatTimeHHMM, formatUtcOffset, missionLocalDate, missionZuluDate } from '../utils/time';
import { applyViewMode } from '../utils/viewMode';
import WhiteboardDrawing from './WhiteboardDrawing';
import MissionMapCanvas from './MissionMapCanvas';
import { formatLegDuration, formatRouteCoordinate } from '../utils/routeLegs';

interface PrintViewProps {
  mission: MissionData;
  settings: DisplaySettings;
  whiteboard: WhiteboardData;
}

type PrintTranslator = (key: string, options?: Record<string, string | number>) => string;

interface FlightEntry {
  flight: Flight;
  side: 'Blue' | 'Red' | 'Neutral';
}

const GUARD_FREQUENCIES_MHZ = {
  UHF: 243.000,
  VHF: 121.500,
} as const;

export default function PrintView({ mission, settings, whiteboard }: PrintViewProps) {
  const { t } = useTranslation();
  const viewMission = useMemo(() => applyViewMode(mission, settings.viewMode), [mission, settings.viewMode]);
  const printT: PrintTranslator = (key, options) => t(key, {
    ...options,
    lng: settings.outputLanguage,
  });
  const flights = getAllFlights(viewMission);

  return (
    <div className="print-view">
      <header className="print-title">
        <h1>{viewMission.meta.sortie || printT('export.canvas.briefing')}</h1>
      </header>

      {settings.briefingSections.map(section => {
        switch (section) {
          case 'overview':
            return <PrintOverview key={section} mission={viewMission} settings={settings} t={printT} />;
          case 'notes':
            return <PrintNotes key={section} mission={viewMission} t={printT} />;
          case 'flights':
            return (
              <section key={section} className="section print-flight-list">
                <h2>{printT('export.printFlights')}</h2>
                {flights.length === 0 ? (
                  <p>{printT('flights.empty')}</p>
                ) : flights.map(({ flight, side }) => (
                  <PrintFlight
                    key={`${side}:${flight.groupId}`}
                    flight={flight}
                    side={side}
                    meta={viewMission.meta}
                    settings={settings}
                    t={printT}
                    notes={viewMission.userNotes.perFlight[`${side.toLowerCase()}:${flight.groupId}`]}
                  />
                ))}
              </section>
            );
          case 'map':
            return (
              <section key={section} className="section print-section print-map">
                <h2>{printT('tabs.map')}</h2>
                <MissionMapCanvas
                  mission={viewMission}
                  className="print-map-canvas"
                  labels={{
                    empty: printT('mapRaster.empty'),
                    routes: printT('mapRaster.routes'),
                    support: printT('mapRaster.support'),
                    threats: printT('mapRaster.threats'),
                    zones: printT('mapRaster.zones'),
                  }}
                />
              </section>
            );
          case 'comms':
            return <PrintComms key={section} mission={viewMission} t={printT} />;
          case 'support':
            return <PrintSupport key={section} mission={viewMission} settings={settings} t={printT} />;
          case 'threats':
            return <PrintThreats key={section} mission={viewMission} settings={settings} t={printT} />;
          case 'whiteboard':
            return <PrintWhiteboard key={section} whiteboard={whiteboard} t={printT} />;
        }
      })}
    </div>
  );
}

function PrintWhiteboard({ whiteboard, t }: { whiteboard: WhiteboardData; t: PrintTranslator }) {
  return (
    <section className="section print-section print-whiteboard">
      <h2>{t('whiteboard.title')}</h2>
      {whiteboard.notes.trim() ? (
        <div className="whiteboard-print-notes">
          <h3>{t('whiteboard.notes')}</h3>
          <p>{whiteboard.notes}</p>
        </div>
      ) : (
        <p className="hint">{t('export.markdown.noWhiteboardNotes')}</p>
      )}
      {whiteboard.strokes.length > 0 && (
        <div className="whiteboard-board print-whiteboard-board">
          <WhiteboardDrawing strokes={whiteboard.strokes} label={t('whiteboard.canvasLabel')} />
        </div>
      )}
    </section>
  );
}

function PrintNotes({ mission, t }: { mission: MissionData; t: PrintTranslator }) {
  const sections: (keyof SMEACNotes)[] = [
    'situation', 'mission', 'execution', 'adminLogistics', 'commandSignal',
  ];
  const filled = sections.filter(section => mission.userNotes.smeac[section].trim());
  const flightNotes = getAllFlights(mission).flatMap(({ flight, side }) => {
    const notes = mission.userNotes.perFlight[`${side.toLowerCase()}:${flight.groupId}`];
    return notes && hasFlightNotes(notes) ? [{ flight, side, notes }] : [];
  });
  if (filled.length === 0 && flightNotes.length === 0) return null;

  return (
    <section className="section print-section print-notes">
      <h2>{t('tabs.notes')}</h2>
      {filled.length > 0 && (
        <section className="print-subsection">
          <h3>{t('notes.smeacTitle')}</h3>
          {filled.map(section => (
            <section className="print-subsection" key={section}>
              <h4>{t(`notes.smeac.${section}`)}</h4>
              <p className="notes-print-text">{mission.userNotes.smeac[section]}</p>
            </section>
          ))}
        </section>
      )}
      {flightNotes.map(({ flight, side, notes }) => (
        <section className="print-subsection" key={`${side}:${flight.groupId}`}>
          <h3>{flight.callsign || flight.name}</h3>
          <dl className="info-grid">
            {notes.pilotName && <><dt>{t('notes.pilotName')}</dt><dd>{notes.pilotName}</dd></>}
            {notes.tot && <><dt>{t('notes.tot')}</dt><dd>{notes.tot}</dd></>}
            {notes.jokerFuel !== null && <><dt>{t('notes.jokerFuel')}</dt><dd>{notes.jokerFuel}</dd></>}
            {notes.bingoFuel !== null && <><dt>{t('notes.bingoFuel')}</dt><dd>{notes.bingoFuel}</dd></>}
          </dl>
          {notes.customNotes && <p className="notes-print-text">{notes.customNotes}</p>}
        </section>
      ))}
    </section>
  );
}

function hasFlightNotes(notes: FlightNotes): boolean {
  return Boolean(notes.pilotName || notes.tot || notes.jokerFuel !== null || notes.bingoFuel !== null || notes.customNotes);
}

function PrintOverview({ mission, settings, t }: { mission: MissionData; settings: DisplaySettings; t: PrintTranslator }) {
  const { meta, weather, coalitions } = mission;
  const blueFlights = coalitions.blue.flights.length;
  const redFlights = coalitions.red.flights.length;
  const totalFlights = blueFlights + redFlights;
  const localDate = missionLocalDate(meta);
  const zuluDate = missionZuluDate(meta);
  const referencePoint = coalitions.blue.bullseye.latlon;
  const hasValidReferencePoint = isValidReferencePoint(referencePoint);
  const sunTimes = hasValidReferencePoint
    ? getSunTimes(zuluDate, referencePoint[0], referencePoint[1])
    : null;
  const moonInfo = hasValidReferencePoint
    ? getMoonInfo(zuluDate, referencePoint[0], referencePoint[1])
    : null;
  const metar = buildMetar(weather, { time: zuluDate });

  return (
    <section className="section print-section print-overview">
      <h2>{t('overview.title')}</h2>
      <dl className="info-grid">
        <dt>{t('overview.sortie')}</dt>
        <dd>{meta.sortie}</dd>

        <dt>{t('overview.map')}</dt>
        <dd>{meta.theatre}</dd>

        <dt>{t('overview.date')}</dt>
        <dd>{formatDateYMD(localDate)}</dd>

        <dt>{t('overview.startLocal')}</dt>
        <dd>{formatDateYMD(localDate)} {formatTimeHHMM(localDate)} ({formatUtcOffset(meta.utcOffset)})</dd>

        <dt>{t('overview.startZulu')}</dt>
        <dd>{formatDateYMD(zuluDate)} {formatTimeHHMM(zuluDate)}Z</dd>

        <dt>{t('overview.meVersion')}</dt>
        <dd>{meta.meVersion}</dd>

        <dt>{t('overview.blueFlights')}</dt>
        <dd>{blueFlights}</dd>

        <dt>{t('overview.redFlights')}</dt>
        <dd>{redFlights}</dd>

        <dt>{t('overview.totalFlights')}</dt>
        <dd>{totalFlights}</dd>
      </dl>

      <section className="section print-subsection">
        <h3>{t('overview.weather')}</h3>
        <dl className="info-grid">
          <dt>{t('overview.temperature')}</dt>
          <dd>{formatTemperature(weather.temperature, settings.temperatureUnit)}</dd>

          <dt>{t('overview.qnh')}</dt>
          <dd>{formatPressure(weather.qnh, settings.pressureUnit)}</dd>

          <dt>{t('overview.visibility')}</dt>
          <dd>{formatDistance(weather.visibility, settings.distanceUnit)}</dd>

          <dt>{t('overview.clouds')}</dt>
          <dd>{weather.clouds.label} ({t('overview.cloudBase', { value: formatAltitude(weather.clouds.base, settings.altitudeUnit) })})</dd>

          <dt>{t('overview.metar')}</dt>
          <dd><code>{metar}</code></dd>

          {weather.fog.enabled && (
            <>
              <dt>{t('overview.fog')}</dt>
              <dd>{t('overview.fogDetails', { thickness: formatAltitude(weather.fog.thickness, settings.altitudeUnit), visibility: formatDistance(weather.fog.visibility, settings.distanceUnit) })}</dd>
            </>
          )}

          {weather.dust.enabled && (
            <>
              <dt>{t('overview.dust')}</dt>
              <dd>{t('overview.dustDensity', { value: weather.dust.density })}</dd>
            </>
          )}

          <dt>{t('overview.groundTurbulence')}</dt>
          <dd>{weather.turbulence.ground}</dd>
        </dl>

        <h4>{t('overview.wind')}</h4>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('overview.altitude')}</th>
              <th>{t('overview.windFrom')}</th>
              <th>{t('overview.windTo')}</th>
              <th>{t('overview.windSpeed')}</th>
            </tr>
          </thead>
          <tbody>
            {weather.wind.map(wind => (
              <tr key={wind.level}>
                <td>{t(`overview.windLevels.${wind.level}`)}</td>
                <td>{wind.from}°</td>
                <td>{wind.to}°</td>
                <td>{formatSpeed(wind.speed, settings.speedUnit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="section print-subsection">
        <h3>{t('overview.astronomy')}</h3>
        <dl className="info-grid">
          <dt>{t('overview.bullseye')}</dt>
          <dd>{hasValidReferencePoint ? `${referencePoint[0].toFixed(4)}°, ${referencePoint[1].toFixed(4)}°` : t('common.notAvailable')}</dd>

          <dt>{t('overview.sunrise')}</dt>
          <dd>{formatAstroTime(sunTimes?.sunrise, meta.utcOffset, t)}</dd>

          <dt>{t('overview.sunset')}</dt>
          <dd>{formatAstroTime(sunTimes?.sunset, meta.utcOffset, t)}</dd>

          <dt>{t('overview.civilTwilight')}</dt>
          <dd>{formatAstroRange(sunTimes, 'dawn', 'dusk', meta.utcOffset, t)}</dd>

          <dt>{t('overview.nauticalTwilight')}</dt>
          <dd>{formatAstroRange(sunTimes, 'nauticalDawn', 'nauticalDusk', meta.utcOffset, t)}</dd>

          <dt>{t('overview.moonAge')}</dt>
          <dd>{moonInfo ? t('overview.moonAgeDays', { days: moonInfo.ageDays.toFixed(1) }) : t('common.notAvailable')}</dd>
        </dl>
      </section>

      {(meta.descriptionBlueTask || meta.descriptionRedTask || meta.descriptionNeutralTask) && (
        <section className="section print-subsection">
          <h3>{t('overview.taskText')}</h3>
          {meta.descriptionBlueTask && (
            <div className="task-text blue">
              <h4>{t('flights.selectBlue')}</h4>
              <pre>{meta.descriptionBlueTask}</pre>
            </div>
          )}
          {meta.descriptionRedTask && (
            <div className="task-text red">
              <h4>{t('flights.selectRed')}</h4>
              <pre>{meta.descriptionRedTask}</pre>
            </div>
          )}
          {meta.descriptionNeutralTask && (
            <div className="task-text neutral">
              <h4>{t('overview.neutral')}</h4>
              <pre>{meta.descriptionNeutralTask}</pre>
            </div>
          )}
        </section>
      )}

      {mission.warnings.length > 0 && (
        <section className="section warnings print-subsection">
          <h3>{t('overview.warning')}</h3>
          <ul>
            {mission.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
          </ul>
        </section>
      )}
    </section>
  );
}

function PrintFlight({ flight, side, meta, settings, t, notes }: { flight: Flight; side: 'Blue' | 'Red' | 'Neutral'; meta: MissionMeta; settings: DisplaySettings; t: PrintTranslator; notes?: FlightNotes }) {
  const leadUnit = flight.units[0];
  const aircraftDefaultCoordinateFormat = getDefaultCoordinateFormat(flight.type);
  const props = leadUnit ? Object.entries(leadUnit.props) : [];
  const link16 = leadUnit?.datalink?.link16;

  return (
    <section className="section print-flight">
      <header className="flight-header">
        <h3>
          <span className={`side-badge ${side.toLowerCase()}`}>{side}</span>
          {flight.name}
        </h3>
        <div className="flight-meta">
          <span className="badge">{flight.type}</span>
          <span className="badge">{t('flights.unitCount', { count: flight.units.length })}</span>
          <span className="badge callsign">{flight.callsign}</span>
          <span className="badge task">{flight.task}</span>
          {flight.hidden && <span className="badge hidden">{t('flights.hidden')}</span>}
        </div>
      </header>

      {notes && (notes.pilotName || notes.tot || notes.jokerFuel !== null || notes.bingoFuel !== null || notes.customNotes) && (
        <section className="section print-subsection">
          <h4>{t('notes.flightTitle')}</h4>
          <dl className="info-grid">
            {notes.pilotName && <><dt>{t('notes.pilotName')}</dt><dd>{notes.pilotName}</dd></>}
            {notes.tot && <><dt>{t('notes.tot')}</dt><dd>{notes.tot}</dd></>}
            {notes.jokerFuel !== null && <><dt>{t('notes.jokerFuel')}</dt><dd>{notes.jokerFuel}</dd></>}
            {notes.bingoFuel !== null && <><dt>{t('notes.bingoFuel')}</dt><dd>{notes.bingoFuel}</dd></>}
          </dl>
          {notes.customNotes && <p className="notes-print-text">{notes.customNotes}</p>}
        </section>
      )}

      <section className="section print-subsection">
        <h4>{t('flights.aircraftRoster')}</h4>
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
            {flight.units.length === 0 ? (
              <tr><td colSpan={7}>{t('common.notAvailable')}</td></tr>
            ) : flight.units.map((unit, index) => (
              <tr key={unit.unitId}>
                <td>{index + 1}</td>
                <td>{unit.tailNumber || '-'}</td>
                <td>{unit.name}</td>
                <td>{unit.skill}</td>
                <td>{unit.livery || '-'}</td>
                <td>{t('flights.fuelAmount', { value: unit.payload.fuel })}</td>
                <td>{unit.payload.chaff} / {unit.payload.flare}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="section print-subsection">
        <h4>{t('flights.loadout')}</h4>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('flights.station')}</th>
              <th>{t('flights.weapon')}</th>
              <th>{t('flights.count')}</th>
            </tr>
          </thead>
          <tbody>
            {!leadUnit || leadUnit.payload.pylons.length === 0 ? (
              <tr><td colSpan={3}>{t('common.notAvailable')}</td></tr>
            ) : leadUnit.payload.pylons.map((pylon, index) => (
              <tr key={`${pylon.station}:${index}`}>
                <td>{pylon.station}</td>
                <td>{pylon.name}</td>
                <td>{pylon.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="section print-subsection">
        <h4>{t('flights.radioPreset')}</h4>
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
            {!leadUnit || leadUnit.radios.length === 0 ? (
              <tr><td colSpan={4}>{t('common.notAvailable')}</td></tr>
            ) : leadUnit.radios.map(radio => (
              <tr key={radio.channel}>
                <td>{radio.channel}</td>
                <td>{radio.frequency.toFixed(3)} MHz</td>
                <td>{formatModulation(radio.modulation)}</td>
                <td>{radio.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="section print-subsection">
        <h4>{t('flights.route')}</h4>
        <p className="coordinate-note">{t('flights.coordinateFormat', { format: settings.coordinateFormat, defaultFormat: aircraftDefaultCoordinateFormat })}</p>
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
            </tr>
          </thead>
          <tbody>
            {flight.route.length === 0 ? (
              <tr><td colSpan={7}>{t('common.notAvailable')}</td></tr>
            ) : flight.route.map((waypoint, routeIndex) => (
                <tr key={`${waypoint.index}:${routeIndex}`}>
                  <td>{waypoint.index}</td>
                  <td>{waypoint.name}</td>
                  <td>{waypoint.action}</td>
                  <td>{formatRouteCoordinate(waypoint, settings.coordinateFormat)}</td>
                  <td>{formatAltitude(waypoint.alt, settings.altitudeUnit)}</td>
                  <td>{formatSpeed(waypoint.speed, settings.speedUnit)}</td>
                  <td>{formatFlightEta(waypoint.eta, meta, t)}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {flight.route.length > 1 && (
          <>
            <h5>{t('flights.legSummary')}</h5>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('flights.distance')}</th>
                  <th>{t('flights.bearing')}</th>
                  <th>{t('flights.legTime')}</th>
                  <th>{t('flights.cumulativeDistance')}</th>
                  <th>{t('flights.cumulativeTime')}</th>
                </tr>
              </thead>
              <tbody>
                {flight.route.slice(1).map((waypoint, routeIndex) => (
                  <tr key={`${waypoint.index}:${routeIndex}`}>
                    <td>{waypoint.index}</td>
                    <td>{waypoint.leg ? formatDistance(waypoint.leg.distance, settings.distanceUnit) : '-'}</td>
                    <td>{waypoint.leg ? waypoint.leg.magneticBearing === undefined
                      ? t('flights.trueBearingOnly', { trueBearing: waypoint.leg.trueBearing.toFixed(0) })
                      : t('flights.bearingValue', { trueBearing: waypoint.leg.trueBearing.toFixed(0), magneticBearing: waypoint.leg.magneticBearing.toFixed(0) }) : '-'}</td>
                    <td>{formatLegDuration(waypoint.leg?.time)}</td>
                    <td>{waypoint.leg ? formatDistance(waypoint.leg.cumulativeDistance, settings.distanceUnit) : '-'}</td>
                    <td>{formatLegDuration(waypoint.leg?.cumulativeTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      {props.length > 0 && (
        <section className="section print-subsection">
          <h4>{t('flights.aircraftSettings')}</h4>
          <dl className="info-grid">
            {props.map(([key, value]) => (
              <div key={key} className="print-definition">
                <dt>{key}</dt>
                <dd>{stringifyValue(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {link16 && (
        <section className="section print-subsection">
          <h4>{t('flights.datalink')}</h4>
          <dl className="info-grid">
            <dt>{t('flights.flightLead')}</dt>
            <dd>{link16.flightLead ? t('common.yes') : t('common.no')}</dd>
            <dt>{t('flights.team')}</dt>
            <dd>{link16.team}</dd>
          </dl>
        </section>
      )}
    </section>
  );
}

function PrintComms({ mission, t }: { mission: MissionData; t: PrintTranslator }) {
  const flights = getAllFlights(mission);
  const support = uniqueSupport(mission);

  return (
    <section className="section print-section print-comms">
      <h2>{t('tabs.comms')}</h2>

      <section className="section print-subsection">
        <h3>{t('comms.flightPlan')}</h3>
        {flights.length === 0 ? (
          <p>{t('flights.empty')}</p>
        ) : flights.map(({ flight, side }) => {
          const leadUnit = flight.units[0];
          return (
            <div key={`${side}:${flight.groupId}`} className="flight-comms">
              <h4>
                <span className={`side-badge ${side.toLowerCase()}`}>{side}</span>
                {flight.callsign} - {flight.name} ({flight.type})
              </h4>
              <p>{t('comms.groupFrequency', {
                frequency: formatFrequencyMHz(toMHz(flight.frequency)),
                modulation: formatModulation(flight.modulation),
              })}</p>
              <table className="data-table small">
                <thead>
                  <tr>
                    <th>CH</th>
                    <th>{t('comms.frequencyMHz')}</th>
                    <th>{t('flights.modulation')}</th>
                    <th>{t('flights.name')}</th>
                  </tr>
                </thead>
                <tbody>
                  {!leadUnit || leadUnit.radios.length === 0 ? (
                    <tr><td colSpan={4}>{t('common.notAvailable')}</td></tr>
                  ) : leadUnit.radios.map(radio => (
                    <tr key={radio.channel}>
                      <td>{radio.channel}</td>
                      <td>{radio.frequency.toFixed(3)}</td>
                      <td>{formatModulation(radio.modulation)}</td>
                      <td>{radio.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </section>

      <section className="section print-subsection">
        <h3>{t('comms.supportFrequency')}</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('comms.type')}</th>
              <th>{t('comms.callsign')}</th>
              <th>{t('comms.frequencyMHz')}</th>
              <th>{t('comms.tacan')}</th>
            </tr>
          </thead>
          <tbody>
            {support.length === 0 ? (
              <tr><td colSpan={4}>{t('support.none')}</td></tr>
            ) : support.map((asset, index) => (
              <tr key={`${asset.kind}:${asset.callsign}:${index}`}>
                <td>{asset.kind}</td>
                <td>{asset.callsign}</td>
                <td>{asset.frequency ? formatFrequencyMHz(toMHz(asset.frequency)) : '-'}</td>
                <td>{asset.tacan?.channel || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="section print-subsection">
        <h3>{t('comms.commonFrequency')}</h3>
        <dl className="info-grid">
          <dt>{t('export.markdown.guardUhf')}</dt>
          <dd>{formatFrequencyMHz(GUARD_FREQUENCIES_MHZ.UHF)} (AM)</dd>
          <dt>{t('export.markdown.guardVhf')}</dt>
          <dd>{formatFrequencyMHz(GUARD_FREQUENCIES_MHZ.VHF)} (AM)</dd>
        </dl>
      </section>
    </section>
  );
}

function PrintSupport({ mission, settings, t }: { mission: MissionData; settings: DisplaySettings; t: PrintTranslator }) {
  const support = uniqueSupport(mission);

  return (
    <section className="section print-section print-support">
      <h2>{t('tabs.support')}</h2>
      {support.length === 0 ? (
        <p>{t('support.none')}</p>
      ) : support.map((asset, index) => (
        <section key={`${asset.kind}:${asset.callsign}:${index}`} className="section support-asset">
          <header className="support-header">
            <h3>{asset.kind.toUpperCase()}: {asset.callsign}</h3>
            <span className="badge">{asset.kind}</span>
          </header>

          <dl className="info-grid">
            <dt>{t('support.callsign')}</dt>
            <dd>{asset.callsign}</dd>

            {asset.frequency && (
              <>
                <dt>{t('support.frequency')}</dt>
                <dd>{formatFrequencyMHz(toMHz(asset.frequency))}</dd>
              </>
            )}

            {asset.tacan && (
              <>
                <dt>{t('comms.tacan')}</dt>
                <dd>{asset.tacan.channel} {asset.tacan.mode}</dd>
              </>
            )}

            {asset.icls && (
              <>
                <dt>{t('support.icls')}</dt>
                <dd>{t('support.channel', { channel: asset.icls.channel })}</dd>
              </>
            )}

            {asset.orbit && (
              <>
                <dt>{t('support.orbitAltitude')}</dt>
                <dd>{formatAltitude(asset.orbit.altitude, settings.altitudeUnit)}</dd>
                <dt>{t('support.orbitSpeed')}</dt>
                <dd>{formatSpeed(asset.orbit.speed, settings.speedUnit)}</dd>
                <dt>{t('support.pattern')}</dt>
                <dd>{asset.orbit.pattern}</dd>
              </>
            )}

            {asset.link4 && (
              <>
                <dt>Link 4</dt>
                <dd>{formatLink4(asset.link4)}</dd>
              </>
            )}

            {asset.laserCode !== undefined && (
              <>
                <dt>Laser Code</dt>
                <dd>{asset.laserCode}</dd>
              </>
            )}

            {asset.datalink !== undefined && (
              <>
                <dt>Datalink</dt>
                <dd>{asset.datalink}</dd>
              </>
            )}

            <dt>{t('support.position')}</dt>
            <dd>{formatSupportPosition(asset, mission.meta.theatre, settings.coordinateFormat)}</dd>
          </dl>
        </section>
      ))}
    </section>
  );
}

function PrintThreats({ mission, settings, t }: { mission: MissionData; settings: DisplaySettings; t: PrintTranslator }) {
  const allEnemies = mission.coalitions.red.aiGroups;
  const threats = allEnemies.filter(hasResolvedThreatRange);
  const unrecordedThreats = allEnemies.filter(isUnrecordedThreat);
  const otherEnemies = allEnemies.filter(group => !hasResolvedThreatRange(group) && !isUnrecordedThreat(group));
  const threatWarnings = [...new Set(mission.warnings.filter(warning => warning.startsWith('脅威半径が未収録')))].sort();
  const unknownUnitWarnings = [...new Set(mission.warnings.filter(warning => warning.startsWith('参照データに未収録のユニット')))].sort();
  const showCreatorDetails = settings.viewMode === 'creator';

  return (
    <section className="section print-section print-threats">
      <h2>{t('tabs.threats')}</h2>

      <section className="section print-subsection">
        <h3>{t('threats.samRing')}</h3>
        {threats.length === 0 ? (
          <p>{t('threats.noThreats')}</p>
        ) : (
          <ThreatTable threats={threats} mission={mission} settings={settings} t={t} showUnrecorded={false} showCreatorDetails={showCreatorDetails} />
        )}

        {unrecordedThreats.length > 0 && (
          <div className="threats-unrecorded">
            <h4>{t('threats.unrecordedTitle')}</h4>
            <p>{t('threats.unrecordedDescription')}</p>
            <ThreatTable threats={unrecordedThreats} mission={mission} settings={settings} t={t} showUnrecorded showCreatorDetails={showCreatorDetails} />
          </div>
        )}

        {threatWarnings.length > 0 && (
          <aside className="warning" aria-label={t('threats.threatRadiusWarningAria')}>
            <strong>{t('threats.threatRadiusWarning')}</strong>
            <ul>
              {threatWarnings.map(warning => <li key={warning}>{warning}</li>)}
            </ul>
          </aside>
        )}

        {unknownUnitWarnings.length > 0 && (
          <aside className="warning" aria-label={t('threats.unknownUnitWarningAria')}>
            <strong>{t('threats.unknownUnitWarning')}</strong>
            <ul>
              {unknownUnitWarnings.map(warning => <li key={warning}>{warning}</li>)}
            </ul>
          </aside>
        )}
      </section>

      {showCreatorDetails && (
        <section className="section print-subsection">
          <h3>{t('threats.enemyAircraft')}</h3>
          {otherEnemies.length === 0 ? (
            <p>{t('threats.noEnemyAircraft')}</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('threats.category')}</th>
                  <th>{t('threats.type')}</th>
                  <th>{t('threats.count')}</th>
                  <th>{t('threats.position')}</th>
                  <th>{t('threats.appearance')}</th>
                  <th>{t('threats.hidden')}</th>
                </tr>
              </thead>
              <tbody>
                {otherEnemies.map((group, index) => (
                  <tr key={groupKey(group, index)}>
                    <td>{group.category}</td>
                    <td>{group.type}</td>
                    <td>{group.count}</td>
                    <td>{formatThreatPosition(group, mission.meta.theatre, settings.coordinateFormat)}</td>
                    <td>{formatTime(group.startTime, t)}</td>
                    <td>{group.hidden ? t('common.yes') : t('common.no')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <section className="section print-subsection">
        <h3>{t('threats.enemyShips')}</h3>
        <p>{t('threats.planned')}</p>
      </section>
    </section>
  );
}

function ThreatTable({ threats, mission, settings, t, showUnrecorded, showCreatorDetails }: {
  threats: AIGroup[];
  mission: MissionData;
  settings: DisplaySettings;
  t: PrintTranslator;
  showUnrecorded: boolean;
  showCreatorDetails: boolean;
}) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>{t('threats.type')}</th>
          <th>{t('threats.count')}</th>
          <th>{t('threats.engagementRange')}</th>
          <th>{t('threats.detectionRange')}</th>
          <th>{t('threats.position')}</th>
          {showCreatorDetails && <th>{t('threats.hidden')}</th>}
          {showCreatorDetails && <th>{t('threats.lateActivation')}</th>}
        </tr>
      </thead>
      <tbody>
        {threats.map((threat, index) => (
          <tr key={groupKey(threat, index)}>
            <td>{threat.type}</td>
            <td>{threat.count}</td>
            <td>{showUnrecorded ? t('threats.unrecorded') : formatThreatRange(threat.threatRange, settings, t)}</td>
            <td>{showUnrecorded ? t('threats.unrecorded') : formatThreatRange(threat.detectionRange, settings, t)}</td>
            <td>{formatThreatPosition(threat, mission.meta.theatre, settings.coordinateFormat)}</td>
            {showCreatorDetails && <td>{threat.hidden ? t('common.yes') : t('common.no')}</td>}
            {showCreatorDetails && <td>{threat.lateActivation ? t('common.yes') : t('common.no')}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function getAllFlights(mission: MissionData): FlightEntry[] {
  return [
    ...mission.coalitions.blue.flights.map(flight => ({ flight, side: 'Blue' as const })),
    ...mission.coalitions.red.flights.map(flight => ({ flight, side: 'Red' as const })),
    ...mission.coalitions.neutral.flights.map(flight => ({ flight, side: 'Neutral' as const })),
  ];
}

function uniqueSupport(mission: MissionData): SupportAsset[] {
  const seen = new Set<string>();
  return [
    ...mission.coalitions.blue.support,
    ...mission.coalitions.red.support,
    ...mission.coalitions.neutral.support,
  ].filter(asset => {
    const key = `${asset.kind}:${asset.callsign}:${asset.position.join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatFlightEta(eta: number, meta: MissionMeta, t: PrintTranslator): string {
  return t('flights.etaValue', {
    localTime: formatEtaLocal(meta, eta),
    zuluTime: formatEtaZulu(meta, eta),
  });
}

function formatSupportPosition(support: SupportAsset, theatre: string, coordinateFormat: DisplaySettings['coordinateFormat']): string {
  const latlon = dcsToLatLon(theatre, support.position[0], support.position[1]) || [0, 0];
  return formatCoordinate(latlon[0], latlon[1], coordinateFormat);
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
  if (!isThreatCandidate || hasResolvedThreatRange(group)) return false;

  return !Number.isFinite(group.threatRange)
    || ((group.threatRange ?? 0) <= 0
      && (!Number.isFinite(group.detectionRange) || (group.detectionRange ?? 0) <= 0));
}

function formatThreatRange(
  range: number | undefined,
  settings: DisplaySettings,
  t: PrintTranslator,
): string {
  if (Number.isFinite(range) && (range ?? 0) > 0) return formatDistance(range!, settings.distanceUnit);
  return t('threats.none');
}

function groupKey(group: AIGroup, occurrence: number): string {
  return `${group.category}:${group.type}:${group.position.join(',')}:${group.startTime}:${occurrence}`;
}

function formatThreatPosition(group: AIGroup, theatre: string, coordinateFormat: DisplaySettings['coordinateFormat']): string {
  const latlon = dcsToLatLon(theatre, group.position[0], group.position[1]) || [0, 0];
  return formatCoordinate(latlon[0], latlon[1], coordinateFormat);
}

function formatTime(seconds: number, t: PrintTranslator): string {
  if (seconds === 0) return t('common.missionStart');
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return t('common.timeOffset', { hours, minutes });
}

function formatFrequencyMHz(frequencyMHz: number): string {
  return `${frequencyMHz.toFixed(3)} MHz`;
}

function toMHz(frequency: number): number {
  return Math.abs(frequency) >= 1000 ? frequency / 1000000 : frequency;
}

function formatModulation(modulation: number): 'AM' | 'FM' {
  return modulation === 0 ? 'AM' : 'FM';
}

function formatLink4(link4: SupportAsset['link4']): string {
  if (!link4) return '';
  const values: string[] = [];
  if (link4.frequency !== undefined) values.push(`${toMHz(link4.frequency).toFixed(3)} MHz`);
  if (link4.channel !== undefined) values.push(`CH ${link4.channel}`);
  if (link4.callsign) values.push(link4.callsign);
  return values.join(' / ');
}

function stringifyValue(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return String(value);
  }
}

function isValidReferencePoint(latlon: [number, number]): boolean {
  const [lat, lon] = latlon;
  return Number.isFinite(lat)
    && Number.isFinite(lon)
    && lat >= -90
    && lat <= 90
    && lon >= -180
    && lon <= 180
    && (lat !== 0 || lon !== 0);
}

function formatAstroTime(date: Date | null | undefined, utcOffset: number, t: PrintTranslator): string {
  if (!date) return t('common.notAvailable');

  const localDate = addSeconds(date, utcOffset * 3600);
  return `${t('common.local')} ${formatDateYMD(localDate)} ${formatTimeHHMM(localDate)} / ${t('common.zulu')} ${formatDateYMD(date)} ${formatTimeHHMM(date)}Z`;
}

function formatAstroRange(times: SunTimes | null, startKey: 'dawn' | 'nauticalDawn', endKey: 'dusk' | 'nauticalDusk', utcOffset: number, t: PrintTranslator): string {
  if (!times) return t('common.notAvailable');
  return `${formatAstroTime(times[startKey], utcOffset, t)}${t('common.rangeSeparator')}${formatAstroTime(times[endKey], utcOffset, t)}`;
}
