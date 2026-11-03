// Owner: P1 (フライト作業画面). The three subviews after the navigation log (SPEC 1.3): comms, lineup and notes.
// The lineup card itself is P7's (LineupCard). The notes form writes through setNotes (updateFlightNotes).
import { useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../shell/EmptyState';
import { Field } from '../../shell/Field';
import { Notice } from '../../shell/Notice';
import { useMission } from '../../shell/MissionContext';
import type { Flight, FlightNotes, Side } from '../../types/mission';
import { updateFlightNotes, emptyFlightNotes } from '../../utils/notes';
import { flightKey } from '../../utils/flightKey';
import { MAX_FLIGHT_SHORT_TEXT_LENGTH, MAX_FLIGHT_TEXT_LENGTH, draftFromFlightNotes, flightNotesFromDraft, formatMegahertz, formatModulation, link16DiffersFromLead, radioDiffersFromLead } from './flightModel';
import type { FlightNotesDraft, FlightNotesDraftEdits, FuelParseResult } from './flightModel';
import LineupCard from './LineupCard';
import { pendingEdits } from './noteDrafts';

/** Radios of each aircraft. A radio that differs from the lead on the same channel is marked (SPEC 1.3). */
export function CommsView({ flight }: { flight: Flight }) {
  const { t } = useTranslation('flight');
  const [lead, ...wingmen] = flight.units;
  if (!lead) return <EmptyState title={t('flight:comms.noUnits')} />;

  return (
    <div className="flight-comms">
      {flight.units.map((unit, index) => {
        const isLead = index === 0;
        const link = unit.datalink?.link16;
        const leadLink = lead.datalink?.link16;
        return (
          <section key={unit.unitId} className="flight-unit" aria-label={unit.name}>
            <h3 className="flight-unit-title">
              {unit.name}
              {unit.tailNumber && <span className="flight-unit-tail">{unit.tailNumber}</span>}
              {isLead && <span className="flight-unit-lead">{t('flight:comms.lead')}</span>}
            </h3>
            {unit.radios.length === 0 ? (
              <p className="hint">{t('flight:comms.noRadio')}</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">{t('flight:comms.channel')}</th>
                    <th scope="col">{t('flight:comms.frequency')}</th>
                    <th scope="col">{t('flight:comms.modulation')}</th>
                    <th scope="col">{t('flight:comms.name')}</th>
                    <th scope="col">{t('flight:comms.difference')}</th>
                  </tr>
                </thead>
                <tbody>
                  {unit.radios.map(radio => {
                    const differs = !isLead && radioDiffersFromLead(radio, lead.radios);
                    return (
                      <tr key={`${radio.channel}:${radio.frequency}:${radio.modulation}`} className={differs ? 'is-diff' : undefined}>
                        <td>{radio.channel}</td>
                        <td>{formatMegahertz(radio.frequency)}</td>
                        <td>{formatModulation(radio.modulation)}</td>
                        <td>{radio.name || '-'}</td>
                        <td>
                          {differs && (
                            <span className="flight-diff">
                              <span aria-hidden="true">▲</span> {t('flight:comms.differs')}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {link && (
              <dl className={`flight-link16${!isLead && link16DiffersFromLead(link, leadLink) ? ' is-diff' : ''}`}>
                <dt>{t('flight:comms.link16Flight')}</dt>
                <dd>{link.flightLead ? t('flight:comms.yes') : t('flight:comms.no')}</dd>
                <dt>{t('flight:comms.link16Team')}</dt>
                <dd>{link.team}</dd>
                {!isLead && link16DiffersFromLead(link, leadLink) && (
                  <dd className="flight-diff">
                    <span aria-hidden="true">▲</span> {t('flight:comms.differs')}
                  </dd>
                )}
              </dl>
            )}
          </section>
        );
      })}
      {wingmen.length === 0 && <p className="hint">{t('flight:comms.singleAircraft')}</p>}
    </div>
  );
}

/** The lead aircraft's lineup card (P7) and the roster of all aircraft (old FlightsTab content). */
export function LineupView({ flight }: { flight: Flight }) {
  const { t } = useTranslation('flight');
  const [showRoster, setShowRoster] = useState(false);
  const lead = flight.units[0];
  if (!lead) return <EmptyState title={t('flight:lineup.noUnits')} />;

  return (
    <div className="flight-lineup">
      <LineupCard flight={flight} unit={lead} />
      <div className="flight-lineup-actions">
        <button
          type="button"
          className="flight-button"
          aria-expanded={showRoster}
          onClick={() => setShowRoster(open => !open)}
        >
          {showRoster ? t('flight:lineup.hideRoster') : t('flight:lineup.showRoster', { count: flight.units.length })}
        </button>
      </div>
      {showRoster && (
        <div className="flight-roster">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">{t('flight:lineup.tail')}</th>
                <th scope="col">{t('flight:lineup.callsign')}</th>
                <th scope="col">{t('flight:lineup.skill')}</th>
                <th scope="col">{t('flight:lineup.livery')}</th>
                <th scope="col">{t('flight:lineup.fuel')}</th>
                <th scope="col">{t('flight:lineup.chaffFlare')}</th>
              </tr>
            </thead>
            <tbody>
              {flight.units.map((unit, index) => (
                <tr key={unit.unitId}>
                  <td>{index + 1}</td>
                  <td>{unit.tailNumber || '-'}</td>
                  <td>{unit.name}</td>
                  <td>{unit.skill || '-'}</td>
                  <td>{unit.livery || '-'}</td>
                  <td>{unit.payload.fuel}</td>
                  <td>{unit.payload.chaff} / {unit.payload.flare}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">{t('flight:lineup.fuelUnitUnverified')}</p>
        </div>
      )}
      {/* The aircraft settings list (raw DCS keys and values) waits for P7's labelled dictionary (F4, aircraftProps.ts).
          Until then the raw keys are not shown. */}
    </div>
  );
}

/** The saved values of a flight that has no notes yet. One constant, so it never changes identity between renders. */
const EMPTY_FLIGHT_NOTES: FlightNotes = emptyFlightNotes();
const DRAFT_FIELDS: readonly (keyof FlightNotesDraft)[] = ['joker', 'bingo', 'tot', 'pilotName', 'customNotes'];

function sameDraft(a: FlightNotesDraft, b: FlightNotesDraft): boolean {
  return DRAFT_FIELDS.every(field => a[field] === b[field]);
}

export interface FlightNotesViewProps {
  side: Side;
  flight: Flight;
  /** Unsaved edits for this flight (changed fields only), held by the flight screen. Undefined means none. */
  draft: FlightNotesDraftEdits | undefined;
  /** Sets or clears (null) the unsaved edits of a flight key. */
  onDraftChange: (key: string, draft: FlightNotesDraftEdits | null) => void;
}

/**
 * Per-flight notes (SPEC 1.3): Joker and Bingo fuel (unit kg（仮） in the label, D4), TOT, pilot name and free text.
 * Edits stay in a draft until 保存. A negative or non-numeric fuel value is refused with a reason under the field.
 * Saving is blocked while the browser store has failed (SPEC 3, 記入の表).
 */
export function FlightNotesView({ side, flight, draft, onDraftChange }: FlightNotesViewProps) {
  const { t } = useTranslation('flight');
  const { notes, setNotes, storageFailed } = useMission();
  const key = flightKey(side, flight.groupId);
  const saved = notes.perFlight[key] ?? EMPTY_FLIGHT_NOTES;
  const savedDraft = draftFromFlightNotes(saved);
  // The edits are laid over the saved values: a field the user did not change always shows the saved value (W1).
  const current: FlightNotesDraft = { ...savedDraft, ...draft };
  const [status, setStatus] = useState<'idle' | 'saved' | 'limit'>('idle');

  const update = (field: keyof FlightNotesDraft, value: string) => {
    setStatus('idle');
    // Only the fields that differ from the saved values are kept: a field typed back to its saved value leaves the
    // draft, so a later change of that field elsewhere shows and is not written over on 保存 (W1). The same rule
    // drops a field when the saved value catches up from elsewhere (pruneNoteDrafts, called by the mission provider).
    onDraftChange(key, pendingEdits({ ...draft, [field]: value }, savedDraft));
  };

  const parsed = flightNotesFromDraft(current);
  const joker = parsed.ok ? null : parsed.joker;
  const bingo = parsed.ok ? null : parsed.bingo;
  const changed = !sameDraft(current, savedDraft);
  const canSave = parsed.ok && changed && !storageFailed;
  const disabledReason = !parsed.ok
    ? t('flight:notes.fixBeforeSave')
    : storageFailed
      ? t('flight:notes.storageFailedTitle')
      : !changed ? t('flight:notes.noChanges') : undefined;

  const save = () => {
    // Enter in a field submits the form even when the button is disabled, so the same guard applies here.
    if (!parsed.ok || !changed || storageFailed) return;
    const updated = updateFlightNotes(notes, key, parsed.notes);
    if (!updated) {
      setStatus('limit');
      return;
    }
    setNotes(updated);
    onDraftChange(key, null);
    setStatus('saved');
  };

  return (
    <form className="flight-notes" onSubmit={event => { event.preventDefault(); save(); }}>
      {storageFailed && (
        <Notice tone="warning" title={t('flight:notes.storageFailedTitle')}>
          {t('flight:notes.storageFailedBody')}
        </Notice>
      )}
      <div className="flight-notes-grid">
        <FuelField
          label={t('flight:notes.joker')}
          hint={t('flight:notes.fuelHint')}
          value={current.joker}
          result={joker}
          onChange={value => update('joker', value)}
        />
        <FuelField
          label={t('flight:notes.bingo')}
          hint={t('flight:notes.fuelHint')}
          value={current.bingo}
          result={bingo}
          onChange={value => update('bingo', value)}
        />
        <Field label={t('flight:notes.tot')}>
          {id => (
            <input
              id={id}
              type="text"
              maxLength={MAX_FLIGHT_SHORT_TEXT_LENGTH}
              value={current.tot}
              onChange={event => update('tot', event.target.value)}
            />
          )}
        </Field>
        <Field label={t('flight:notes.pilotName')}>
          {id => (
            <input
              id={id}
              type="text"
              maxLength={MAX_FLIGHT_SHORT_TEXT_LENGTH}
              value={current.pilotName}
              onChange={event => update('pilotName', event.target.value)}
            />
          )}
        </Field>
      </div>
      <Field label={t('flight:notes.customNotes')}>
        {id => (
          <textarea
            id={id}
            rows={4}
            maxLength={MAX_FLIGHT_TEXT_LENGTH}
            value={current.customNotes}
            onChange={event => update('customNotes', event.target.value)}
          />
        )}
      </Field>
      <div className="flight-notes-actions">
        <button type="submit" className="flight-button flight-button-primary" disabled={!canSave}>{t('flight:notes.save')}</button>
        {disabledReason && <span className="field-reason">{disabledReason}</span>}
      </div>
      {status === 'saved' && !storageFailed && <Notice tone="success">{t('flight:notes.saved')}</Notice>}
      {status === 'limit' && <Notice tone="warning">{t('flight:notes.limit')}</Notice>}
    </form>
  );
}

interface FuelFieldProps {
  label: string;
  hint: string;
  value: string;
  result: FuelParseResult | null;
  onChange: (value: string) => void;
}

/**
 * A fuel field. The value stays text, so an incomplete entry such as "-" is kept and refused by parseFuelDraft
 * with a reason, instead of the browser clearing it. The hint and the reason are described by the input.
 */
function FuelField({ label, hint, value, result, onChange }: FuelFieldProps) {
  const { t } = useTranslation('flight');
  const reason = fuelReason(result, t);
  return (
    <Field label={label}>
      {id => {
        const hintId = `${id}-hint`;
        const reasonId = `${id}-reason`;
        const describedBy = reason ? `${hintId} ${reasonId}` : hintId;
        return (
          <>
            <input
              id={id}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={value}
              aria-invalid={reason ? true : undefined}
              aria-describedby={describedBy}
              onChange={event => onChange(event.target.value)}
            />
            <p className="field-hint" id={hintId}>{hint}</p>
            {reason && <p className="field-reason" id={reasonId}>{reason}</p>}
          </>
        );
      }}
    </Field>
  );
}

function fuelReason(result: FuelParseResult | null, t: TFunction): string | undefined {
  if (!result || result.ok) return undefined;
  return result.reason === 'negative' ? t('flight:notes.negative') : t('flight:notes.notNumber');
}
