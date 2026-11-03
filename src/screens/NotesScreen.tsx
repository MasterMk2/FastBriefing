// Owner: P6 (記入・改版・ファイル操作・初回画面). Notes screen (SPEC 1.3 記入, F11).
// Contract: default export, no props. Notes come from useMission().notes; every change goes through setNotes,
// and App saves it and refuses to overwrite a record it cannot read. The whiteboard is useMission().whiteboard.
import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Field } from '../shell/Field';
import { Notice } from '../shell/Notice';
import { useMission } from '../shell/MissionContext';
import { useWorkspace } from '../shell/workspace';
import type { Flight, FlightNotes, MissionData, SMEACNotes, UserNotes } from '../types/mission';
import {
  emptyFlightNotes,
  findPreviousStoredNotes,
  hasNotesContent,
  inspectStoredNotes,
  MAX_FLIGHT_NOTES,
  parseNotesSidecar,
  saveStoredNotes,
  serializeNotesSidecar,
  setAsideAndSaveStoredNotes,
  updateFlightNotes,
} from '../utils/notes';
import { flightKey, type FlightKeySide } from '../utils/flightKey';
import { filterWaypointAnnotationsForFlights } from '../utils/waypointAnnotations';
import { WhiteboardPanel } from './notes/WhiteboardPanel';

type SmeacField = keyof SMEACNotes;
const SMEAC_FIELDS: SmeacField[] = ['situation', 'mission', 'execution', 'adminLogistics', 'commandSignal'];
type NotesSection = SmeacField | 'flights' | 'whiteboard' | 'storage';
const SECTIONS: NotesSection[] = [...SMEAC_FIELDS, 'flights', 'whiteboard', 'storage'];
const MAX_NOTE_LENGTH = 10000;
const MAX_IMPORT_BYTES = 32 * 1024 * 1024;

type FuelField = 'jokerFuel' | 'bingoFuel';
interface ListedFlight { key: string; flight: Flight }

/**
 * Flights that the notes can name in the displayed view (D1). Keys are flightKey() values (`side:groupId`,
 * neutral included), the same form as the notes keys and the workspace selection.
 */
function listFlights(view: MissionData): ListedFlight[] {
  const sides: FlightKeySide[] = ['blue', 'red', 'neutral'];
  return sides.flatMap(side =>
    view.coalitions[side].flights.map(flight => ({ key: flightKey(side, flight.groupId), flight })));
}

function fuelPatch(field: FuelField, value: number | null): Partial<FlightNotes> {
  return field === 'jokerFuel' ? { jokerFuel: value } : { bingoFuel: value };
}

/** A non-negative decimal as typed. "-", "1e", "0x10" and "-5" do not match and are not saved. */
const FUEL_PATTERN = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * The number a fuel text stands for: null for an empty field, undefined for an entry that is not valid.
 * "12." is valid and stands for 12, so it is saved while the field keeps showing "12.".
 */
function parseFuelText(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!FUEL_PATTERN.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

export default function NotesScreen() {
  const { t } = useTranslation('notes');
  const { view, viewMode, notes, setNotes, storageFailed } = useMission();
  const { flightKey: selectedKey, setFlightKey } = useWorkspace();
  const [section, setSection] = useState<NotesSection>('situation');
  const [message, setMessage] = useState('');
  // The fuel text as typed, per field. It is what the field shows while it stands for the saved value, and an
  // invalid entry is shown with its reason and is not saved (SPEC 5.1 F3).
  const [fuelDrafts, setFuelDrafts] = useState<Record<string, string>>({});

  const flights = useMemo(() => listFlights(view), [view]);
  const activeKey = flights.some(item => item.key === selectedKey) ? selectedKey : flights[0]?.key ?? null;
  const storedState = useMemo(() => inspectStoredNotes(notes.missionKey).kind, [notes]);
  // A record that cannot be read is never overwritten, so an import would not be saved and is not offered (F11).
  const importBlocked = storageFailed && storedState === 'corrupt';
  const importInputRef = useRef<HTMLInputElement>(null);
  const previous = useMemo(
    () => (storedState === 'absent' || storedState === 'ok') && !hasNotesContent(notes)
      ? findPreviousStoredNotes(notes.missionKey)
      : null,
    [notes, storedState],
  );

  const applySmeac = (field: SmeacField, value: string) => {
    setNotes({ ...notes, smeac: { ...notes.smeac, [field]: value } });
  };

  const applyFlight = (key: string, patch: Partial<FlightNotes>) => {
    const updated = updateFlightNotes(notes, key, { ...(notes.perFlight[key] ?? emptyFlightNotes()), ...patch });
    if (!updated) {
      setMessage(t('notes:flights.limit', { count: MAX_FLIGHT_NOTES }));
      return;
    }
    setMessage('');
    setNotes(updated);
  };

  const applyFuel = (key: string, field: FuelField, text: string) => {
    setFuelDrafts(current => ({ ...current, [`${key}:${field}`]: text }));
    // Only an emptied field clears the saved value. An entry that is not valid is kept as typed and not saved.
    const value = parseFuelText(text);
    if (value === undefined) return;
    applyFlight(key, fuelPatch(field, value));
  };

  const exportNotes = () => {
    const visibleKeys = new Set(flights.map(item => item.key));
    // Pilot view writes only the flights it shows (D1). Map notes have coordinates but no side, so pilot view
    // writes none of them: the output carries no enemy positions. Creator view writes everything.
    const outgoing: UserNotes = viewMode === 'creator' ? notes : {
      ...notes,
      perFlight: Object.fromEntries(Object.entries(notes.perFlight).filter(([key]) => visibleKeys.has(key))),
      waypoints: filterWaypointAnnotationsForFlights(notes.waypoints, visibleKeys),
      mapAnnotations: [],
    };
    try {
      const blob = new Blob([serializeNotesSidecar(outgoing)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'fastbriefing-notes.json';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setMessage(t('notes:storage.exported'));
    } catch {
      setMessage(t('notes:storage.exportFailed'));
    }
  };

  const importNotes = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || importBlocked) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setMessage(t('notes:storage.importFailed'));
      return;
    }
    try {
      const parsed = parseNotesSidecar(await file.text(), notes.missionKey);
      // The notes go on screen either way. The success text is shown only when the store keeps them (F11).
      const saved = saveStoredNotes(parsed);
      setNotes(parsed);
      setFuelDrafts({});
      setMessage(t(saved ? 'notes:storage.imported' : 'notes:storage.importedUnsaved'));
    } catch {
      setMessage(t('notes:storage.importFailed'));
    }
  };

  // Keeps the notes on screen and saves them again after the unreadable record is set aside (F11). The success
  // text is shown only when the save worked; a new object makes App save again and refresh its save state.
  const setAside = () => {
    try {
      const { backupKey, saved } = setAsideAndSaveStoredNotes(notes);
      setNotes({ ...notes });
      if (!saved) {
        setMessage(t('notes:status.setAsideSaveFailed', { key: backupKey ?? '' }));
        return;
      }
      setMessage(backupKey ? t('notes:status.setAsideDone', { key: backupKey }) : '');
    } catch {
      setMessage(t('notes:status.setAsideFailed'));
    }
  };

  const loadPrevious = () => {
    if (!previous) return;
    setNotes({ ...previous, missionKey: notes.missionKey });
    setFuelDrafts({});
    setMessage(t('notes:status.previousLoaded'));
  };

  return (
    <div className="notes-screen">
      <header className="notes-header">
        <h2>{t('notes:title')}</h2>
        <p className="notes-save-state" role="status">
          {storageFailed ? t('notes:status.headerUnavailable') : t('notes:status.saved')}
        </p>
      </header>

      {storageFailed && storedState === 'corrupt' && (
        <Notice tone="error" title={t('notes:status.corruptTitle')}>
          <p>{t('notes:status.corruptBody')}</p>
          <button type="button" className="btn btn-secondary" onClick={setAside}>{t('notes:status.setAside')}</button>
        </Notice>
      )}
      {storageFailed && storedState !== 'corrupt' && (
        <Notice tone="error" title={t('notes:status.unavailable')} />
      )}
      {!storageFailed && previous && (
        <Notice tone="info" title={t('notes:status.previousAvailable')}>
          <button type="button" className="btn btn-secondary" onClick={loadPrevious}>{t('notes:status.loadPrevious')}</button>
        </Notice>
      )}

      <div className="notes-layout">
        <nav className="notes-nav" aria-label={t('notes:nav.label')}>
          {SECTIONS.map(item => (
            <button
              key={item}
              type="button"
              className="notes-nav-item"
              aria-current={section === item ? 'true' : undefined}
              onClick={() => setSection(item)}
            >
              {t(`notes:sections.${item}`)}
            </button>
          ))}
        </nav>

        <div className="notes-body">
          {section === 'flights' && (
            <FlightSection
              flights={flights}
              activeKey={activeKey}
              onSelect={setFlightKey}
              notes={notes}
              fuelDrafts={fuelDrafts}
              onPatch={applyFlight}
              onFuel={applyFuel}
            />
          )}
          {section === 'whiteboard' && <WhiteboardPanel />}
          {section === 'storage' && (
            <section className="notes-section" aria-labelledby="notes-storage-title">
              <h3 id="notes-storage-title">{t('notes:storage.title')}</h3>
              <p className="hint">{t('notes:storage.help')}</p>
              {viewMode === 'pilot' && <p className="hint">{t('notes:storage.pilotNote')}</p>}
              {importBlocked && <p className="notes-field-error" id="notes-import-blocked">▲ {t('notes:storage.importBlocked')}</p>}
              <div className="notes-actions">
                <button type="button" className="btn btn-secondary" onClick={exportNotes}>{t('notes:storage.export')}</button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={importBlocked}
                  aria-describedby={importBlocked ? 'notes-import-blocked' : undefined}
                  onClick={() => importInputRef.current?.click()}
                >
                  {t('notes:storage.import')}
                </button>
                <input
                  ref={importInputRef}
                  className="visually-hidden"
                  type="file"
                  accept=".json,application/json"
                  tabIndex={-1}
                  aria-hidden="true"
                  disabled={importBlocked}
                  onChange={event => void importNotes(event)}
                />
              </div>
            </section>
          )}
          {SMEAC_FIELDS.includes(section as SmeacField) && (
            <SmeacSection field={section as SmeacField} value={notes.smeac[section as SmeacField]} onChange={applySmeac} />
          )}
          {message && <p role="status" className="notes-message">{message}</p>}
        </div>
      </div>
    </div>
  );
}

function SmeacSection({ field, value, onChange }: {
  field: SmeacField;
  value: string;
  onChange: (field: SmeacField, value: string) => void;
}) {
  const { t } = useTranslation('notes');
  return (
    <section className="notes-section" aria-labelledby={`notes-smeac-${field}`}>
      <h3 id={`notes-smeac-${field}`}>{t(`notes:sections.${field}`)}</h3>
      <p className="hint">{t('notes:smeacHelp')}</p>
      <Field label={t(`notes:smeac.${field}`)}>
        {id => (
          <textarea
            id={id}
            className="notes-textarea"
            value={value}
            maxLength={MAX_NOTE_LENGTH}
            rows={12}
            onChange={event => onChange(field, event.target.value)}
          />
        )}
      </Field>
      <p className="notes-count">{t('notes:screen.charCount', { count: value.length, max: MAX_NOTE_LENGTH })}</p>
    </section>
  );
}

function FlightSection({ flights, activeKey, onSelect, notes, fuelDrafts, onPatch, onFuel }: {
  flights: ListedFlight[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  notes: UserNotes;
  fuelDrafts: Record<string, string>;
  onPatch: (key: string, patch: Partial<FlightNotes>) => void;
  onFuel: (key: string, field: FuelField, text: string) => void;
}) {
  const { t } = useTranslation('notes');
  const active = flights.find(item => item.key === activeKey) ?? null;
  return (
    <section className="notes-section" aria-labelledby="notes-flights-title">
      <h3 id="notes-flights-title">{t('notes:flights.title')}</h3>
      <p className="hint">{t('notes:flights.help')}</p>
      {flights.length === 0 ? (
        <p className="notes-empty">{t('notes:flights.empty')}</p>
      ) : (
        <div className="notes-flights">
          <ul className="notes-flight-list" aria-label={t('notes:flights.pick')}>
            {flights.map(({ key, flight }) => (
              <li key={key}>
                <button
                  type="button"
                  className="notes-flight-item"
                  aria-pressed={key === activeKey}
                  onClick={() => onSelect(key)}
                >
                  {flightTitle(flight)}
                </button>
              </li>
            ))}
          </ul>
          {active && (
            <FlightEditor
              flightKey={active.key}
              flight={active.flight}
              value={notes.perFlight[active.key] ?? emptyFlightNotes()}
              fuelDrafts={fuelDrafts}
              onPatch={onPatch}
              onFuel={onFuel}
            />
          )}
        </div>
      )}
    </section>
  );
}

/** "callsign — group name"; only one of them when the group has no callsign (the normalizer then gives its name). */
function flightTitle(flight: Flight): string {
  const name = flight.name.trim();
  return !name || name === flight.callsign.trim() ? flight.callsign : `${flight.callsign} — ${flight.name}`;
}

function FlightEditor({ flightKey, flight, value, fuelDrafts, onPatch, onFuel }: {
  flightKey: string;
  flight: Flight;
  value: FlightNotes;
  fuelDrafts: Record<string, string>;
  onPatch: (key: string, patch: Partial<FlightNotes>) => void;
  onFuel: (key: string, field: FuelField, text: string) => void;
}) {
  const { t } = useTranslation('notes');
  const fuelField = (field: FuelField, label: string) => {
    const saved = value[field];
    const draft = fuelDrafts[`${flightKey}:${field}`];
    const parsed = draft === undefined ? null : parseFuelText(draft);
    const invalid = draft !== undefined && parsed === undefined;
    // A draft shows as typed while it stands for the saved value ("12." for 12) or while it is invalid. Otherwise the
    // saved value shows, for example after notes were imported or a previous version was loaded.
    const showDraft = draft !== undefined && (invalid || parsed === saved);
    const text = showDraft ? draft : (saved === null ? '' : String(saved));
    return (
      <Field label={label}>
        {id => (
          <>
            <input
              id={id}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={text}
              aria-invalid={invalid || undefined}
              onChange={event => onFuel(flightKey, field, event.target.value)}
            />
            {invalid && <p className="notes-field-error">▲ {t('notes:flights.fuelInvalid')}</p>}
          </>
        )}
      </Field>
    );
  };

  return (
    <div className="notes-editor">
      <h4>{flightTitle(flight)}</h4>
      <Field label={t('notes:flights.pilotName')}>
        {id => (
          <input
            id={id}
            type="text"
            maxLength={MAX_NOTE_LENGTH}
            value={value.pilotName}
            onChange={event => onPatch(flightKey, { pilotName: event.target.value })}
          />
        )}
      </Field>
      <Field label={t('notes:flights.tot')}>
        {id => (
          <input
            id={id}
            type="text"
            maxLength={MAX_NOTE_LENGTH}
            value={value.tot}
            onChange={event => onPatch(flightKey, { tot: event.target.value })}
          />
        )}
      </Field>
      <div className="notes-fuel">
        {fuelField('jokerFuel', t('notes:flights.joker'))}
        {fuelField('bingoFuel', t('notes:flights.bingo'))}
      </div>
      <Field label={t('notes:flights.customNotes')}>
        {id => (
          <textarea
            id={id}
            className="notes-textarea"
            rows={6}
            maxLength={MAX_NOTE_LENGTH}
            value={value.customNotes}
            onChange={event => onPatch(flightKey, { customNotes: event.target.value })}
          />
        )}
      </Field>
    </div>
  );
}
