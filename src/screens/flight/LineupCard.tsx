import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMission } from '../../shell/MissionContext';
import { Notice } from '../../shell/Notice';
import type { Flight, Unit } from '../../types/mission';
import { classifyAircraftProps, sortPylonsByStation } from '../../utils/aircraftProps';
import { flightKey } from '../../utils/flightKey';
import { isWingmanUnit, sideOfFlight, useWingmanSlot, writeWingmanSlot } from '../../utils/wingmanSlot';

// Lineup of one aircraft: callsign, tail number, type, payload in station order, fuel,
// radio presets, aircraft settings (laser codes, IFF, STN, ...) and Link16. Also lets
// the user choose this aircraft as "自機" on this device (F4). The choice is kept in
// this browser only and is never written to exported material. Nothing is shown for a
// flight that is not in the displayed view (pilot view, D1).
export interface LineupCardProps {
  flight: Flight;
  unit: Unit;
}

type LineupNotice = 'saveFailed' | 'clearFailed';

export default function LineupCard({ flight, unit }: LineupCardProps) {
  const { t } = useTranslation('wingman');
  const { view } = useMission();
  const slot = useWingmanSlot();
  const [notice, setNotice] = useState<LineupNotice | null>(null);
  const titleId = useId();
  const reasonId = useId();
  const chosenStatusRef = useRef<HTMLParagraphElement>(null);
  const chooseButtonRef = useRef<HTMLButtonElement>(null);
  // Set only by this card's own buttons: the button that was pressed is replaced, so the focus moves to the new control.
  const moveFocusOnChange = useRef(false);

  // Runs after the choice changes (also when a refused save or clear still changes the choice in memory).
  useEffect(() => {
    if (!moveFocusOnChange.current) return;
    moveFocusOnChange.current = false;
    (chosenStatusRef.current ?? chooseButtonRef.current)?.focus();
  }, [slot]);

  // Pilot view (D1): a flight of the other side is absent from `view`, so the whole card stays hidden.
  const side = sideOfFlight(view, flight);
  if (side === null) return null;

  const missionKey = view.userNotes.missionKey;
  const hasMissionKey = missionKey !== '';
  const chosen = isWingmanUnit(slot, missionKey, side, flight, unit.unitId);

  const payload = unit.payload;
  const pylons = sortPylonsByStation(payload?.pylons ?? []);
  const radios = unit.radios ?? [];
  const settings = classifyAircraftProps(unit.props);
  const link16 = unit.datalink?.link16;

  function chooseWingman() {
    if (side === null || !hasMissionKey) return;
    moveFocusOnChange.current = true;
    const saved = writeWingmanSlot({ missionKey, flightKey: flightKey(side, flight.groupId), unitId: unit.unitId });
    setNotice(saved ? null : 'saveFailed');
  }

  function clearWingman() {
    moveFocusOnChange.current = true;
    setNotice(writeWingmanSlot(null) ? null : 'clearFailed');
  }

  return (
    <section className="lineup-card" aria-labelledby={titleId}>
      <header className="lineup-card-head">
        <h3 id={titleId} className="lineup-card-title">{unit.name || flight.callsign}</h3>
      </header>

      <dl className="lineup-facts">
        <div>
          <dt>{t('wingman:lineup.callsign')}</dt>
          <dd>{flight.callsign}</dd>
        </div>
        <div>
          <dt>{t('wingman:lineup.tailNumber')}</dt>
          <dd className="num">{unit.tailNumber || t('wingman:lineup.noTailNumber')}</dd>
        </div>
        <div>
          <dt>{t('wingman:lineup.type')}</dt>
          <dd>{flight.type}</dd>
        </div>
      </dl>

      <section className="lineup-section" aria-label={t('wingman:lineup.payload')}>
        <h4 className="lineup-section-title">{t('wingman:lineup.payload')}</h4>
        {pylons.length === 0 ? (
          <p className="lineup-empty">{t('wingman:lineup.noPayload')}</p>
        ) : (
          <div className="lineup-table-scroll">
            <table className="lineup-table">
              <thead>
                <tr>
                  <th scope="col" className="num">{t('wingman:lineup.station')}</th>
                  <th scope="col">{t('wingman:lineup.weapon')}</th>
                  <th scope="col" className="num">{t('wingman:lineup.count')}</th>
                </tr>
              </thead>
              <tbody>
                {pylons.map((pylon, index) => (
                  <tr key={`${pylon.station}:${index}`}>
                    <td className="num">{pylon.station}</td>
                    <td>{pylon.name}</td>
                    <td className="num">{pylon.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <dl className="lineup-facts">
          <div>
            <dt>{t('wingman:lineup.fuel')}</dt>
            <dd className="num">{payload?.fuel ?? 0}</dd>
          </div>
          <div>
            <dt>{t('wingman:lineup.countermeasures')}</dt>
            <dd className="num">{payload?.chaff ?? 0} / {payload?.flare ?? 0} / {payload?.gun ?? 0}</dd>
          </div>
        </dl>
      </section>

      <section className="lineup-section" aria-label={t('wingman:lineup.radios')}>
        <h4 className="lineup-section-title">{t('wingman:lineup.radios')}</h4>
        {radios.length === 0 ? (
          <p className="lineup-empty">{t('wingman:lineup.noRadios')}</p>
        ) : (
          <div className="lineup-table-scroll">
            <table className="lineup-table">
              <thead>
                <tr>
                  <th scope="col" className="num">{t('wingman:lineup.channel')}</th>
                  <th scope="col" className="num">{t('wingman:lineup.frequency')}</th>
                  <th scope="col">{t('wingman:lineup.modulation')}</th>
                  <th scope="col">{t('wingman:lineup.radioName')}</th>
                </tr>
              </thead>
              <tbody>
                {radios.map((radio, index) => (
                  <tr key={`${radio.radio ?? 0}:${radio.channel}:${index}`}>
                    <td className="num">{radio.channel}</td>
                    <td className="num">{radio.frequency.toFixed(3)}</td>
                    <td>{radio.modulation === 0 ? 'AM' : 'FM'}</td>
                    <td>{radio.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="lineup-section" aria-label={t('wingman:lineup.aircraftSettings')}>
        <h4 className="lineup-section-title">{t('wingman:lineup.aircraftSettings')}</h4>
        <dl className="lineup-facts">
          {settings.known.map(entry => (
            <div key={entry.key}>
              <dt>{t(entry.labelKey)}</dt>
              <dd className="num">
                {entry.value.kind === 'bool'
                  ? (entry.value.value ? t('wingman:lineup.yes') : t('wingman:lineup.no'))
                  : entry.value.text}
              </dd>
            </div>
          ))}
          <div>
            <dt>{t('wingman:lineup.link16')}</dt>
            <dd>
              {link16
                ? `${t('wingman:lineup.link16FlightLead')}: ${link16.flightLead ? t('wingman:lineup.yes') : t('wingman:lineup.no')} / ${t('wingman:lineup.link16Team')}: ${link16.team}`
                : t('wingman:lineup.link16None')}
            </dd>
          </div>
        </dl>
        {settings.other.length > 0 && (
          <>
            <h5 className="lineup-subtitle">{t('wingman:lineup.otherSettings')}</h5>
            <dl className="lineup-facts">
              {settings.other.map(entry => (
                <div key={entry.key}>
                  <dt className="lineup-raw-key">{entry.key}</dt>
                  <dd className="num">
                    {entry.value.kind === 'bool'
                      ? (entry.value.value ? t('wingman:lineup.yes') : t('wingman:lineup.no'))
                      : entry.value.text}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </section>

      <footer className="lineup-card-actions">
        {chosen ? (
          <>
            <p ref={chosenStatusRef} tabIndex={-1} role="status" className="lineup-current">{t('wingman:lineup.currentWingman')}</p>
            <button type="button" className="lineup-button" onClick={clearWingman}>
              {t('wingman:lineup.clearWingman')}
            </button>
          </>
        ) : (
          <>
            <button
              ref={chooseButtonRef}
              type="button"
              className="lineup-button lineup-button-primary"
              disabled={!hasMissionKey}
              aria-describedby={hasMissionKey ? undefined : reasonId}
              onClick={chooseWingman}
            >
              {t('wingman:lineup.chooseWingman')}
            </button>
            {!hasMissionKey && <p id={reasonId} className="lineup-empty">{t('wingman:lineup.noMissionKey')}</p>}
          </>
        )}
      </footer>
      {notice === 'saveFailed' && <Notice tone="warning">{t('wingman:lineup.saveFailed')}</Notice>}
      {notice === 'clearFailed' && <Notice tone="warning">{t('wingman:clearFailed')}</Notice>}
    </section>
  );
}
