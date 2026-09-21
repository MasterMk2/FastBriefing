import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { DisplaySettings, FlightNotes, MissionData, SMEACNotes, UserNotes } from '../types/mission';
import { emptyFlightNotes, parseNotesSidecar, serializeNotesSidecar } from '../utils/notes';
import { applyViewMode } from '../utils/viewMode';

interface NotesTabProps {
  mission: MissionData;
  settings: DisplaySettings;
  onNotesChange: (notes: UserNotes) => void;
  storageFailed: boolean;
}

const sections: (keyof SMEACNotes)[] = [
  'situation', 'mission', 'execution', 'adminLogistics', 'commandSignal',
];

export default function NotesTab({ mission, settings, onNotesChange, storageFailed }: NotesTabProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState('');
  const viewMission = useMemo(() => applyViewMode(mission, settings.viewMode), [mission, settings.viewMode]);
  const flights = [
    ...viewMission.coalitions.blue.flights.map(flight => ({ key: `blue:${flight.groupId}`, flight })),
    ...viewMission.coalitions.red.flights.map(flight => ({ key: `red:${flight.groupId}`, flight })),
    ...viewMission.coalitions.neutral.flights.map(flight => ({ key: `neutral:${flight.groupId}`, flight })),
  ];
  const notes = mission.userNotes;

  const updateSmeac = (field: keyof SMEACNotes, value: string) => {
    onNotesChange({ ...notes, smeac: { ...notes.smeac, [field]: value } });
  };

  const updateFlight = (key: string, field: keyof FlightNotes, value: string) => {
    const previous = notes.perFlight[key] ?? emptyFlightNotes();
    const nextValue = field === 'jokerFuel' || field === 'bingoFuel'
      ? value === '' ? null : Number(value)
      : value;
    if (typeof nextValue === 'number' && (!Number.isFinite(nextValue) || nextValue < 0)) return;
    onNotesChange({
      ...notes,
      perFlight: { ...notes.perFlight, [key]: { ...previous, [field]: nextValue } },
    });
  };

  const exportSidecar = () => {
    const visibleKeys = new Set(flights.map(({ key }) => key));
    const sidecarNotes = settings.viewMode === 'creator' ? notes : {
      ...notes,
      perFlight: Object.fromEntries(Object.entries(notes.perFlight).filter(([key]) => visibleKeys.has(key))),
    };
    const blob = new Blob([serializeNotesSidecar(sidecarNotes)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fastbriefing-notes.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus(t('notes.exported'));
  };

  const importSidecar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 32 * 1024 * 1024) {
      setStatus(t('notes.importFailed'));
      return;
    }
    try {
      const imported = parseNotesSidecar(await file.text(), notes.missionKey);
      onNotesChange(imported);
      setStatus(t('notes.imported'));
    } catch {
      setStatus(t('notes.importFailed'));
    }
  };

  return (
    <div className="tab-panel notes">
      <section className="section">
        <h2>{t('notes.smeacTitle')}</h2>
        <p className="hint">{t('notes.smeacHelp')}</p>
        <div className="notes-fields">
          {sections.map(field => (
            <label key={field} className="notes-field">
              <span>{t(`notes.smeac.${field}`)}</span>
              <textarea value={notes.smeac[field]} maxLength={10000} rows={4} onChange={event => updateSmeac(field, event.target.value)} />
            </label>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>{t('notes.flightTitle')}</h2>
        {flights.length === 0 && <p>{t('flights.empty')}</p>}
        {flights.map(({ key, flight }) => {
          const flightNotes = notes.perFlight[key] ?? emptyFlightNotes();
          return (
            <details key={key} className="notes-flight">
              <summary>{flight.callsign} — {flight.name}</summary>
              <div className="notes-flight-fields">
                <label className="notes-field">
                  <span>{t('notes.pilotName')}</span>
                  <input type="text" maxLength={10000} value={flightNotes.pilotName} onChange={event => updateFlight(key, 'pilotName', event.target.value)} />
                </label>
                <label className="notes-field">
                  <span>{t('notes.tot')}</span>
                  <input type="text" maxLength={10000} value={flightNotes.tot} onChange={event => updateFlight(key, 'tot', event.target.value)} />
                </label>
                <label className="notes-field">
                  <span>{t('notes.jokerFuel')}</span>
                  <input type="number" min="0" step="any" value={flightNotes.jokerFuel ?? ''} onChange={event => updateFlight(key, 'jokerFuel', event.target.value)} />
                </label>
                <label className="notes-field">
                  <span>{t('notes.bingoFuel')}</span>
                  <input type="number" min="0" step="any" value={flightNotes.bingoFuel ?? ''} onChange={event => updateFlight(key, 'bingoFuel', event.target.value)} />
                </label>
                <label className="notes-field notes-field-wide">
                  <span>{t('notes.customNotes')}</span>
                  <textarea rows={3} maxLength={10000} value={flightNotes.customNotes} onChange={event => updateFlight(key, 'customNotes', event.target.value)} />
                </label>
              </div>
            </details>
          );
        })}
      </section>

      <section className="section">
        <h2>{t('notes.sidecarTitle')}</h2>
        <p className="hint">{t('notes.sidecarHelp')}</p>
        <div className="export-actions">
          <button type="button" className="btn btn-secondary" onClick={exportSidecar}>{t('notes.exportSidecar')}</button>
          <label className="btn btn-secondary">
            {t('notes.importSidecar')}
            <input className="visually-hidden" type="file" accept=".json,application/json" onChange={event => void importSidecar(event)} />
          </label>
        </div>
        {storageFailed && <p className="warning" role="alert">{t('notes.storageFailed')}</p>}
        {status && <p role="status">{status}</p>}
      </section>
    </div>
  );
}
