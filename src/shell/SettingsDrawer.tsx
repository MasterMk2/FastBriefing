// Owner: P8 (表示設定). Right drawer for the display settings (SPEC 1.3, 5.1 F1).
// Contract (frozen): default export SettingsDrawer, props SettingsDrawerProps below.
//   Right drawer (360px; bottom sheet under 768px, see shell.css). Changes apply at once; there is no
//   save button and one "既定に戻す". Esc and the close button call onClose; AppShell returns focus to
//   #shell-settings-trigger. Reads and writes only through useSettings(), so it also works before a
//   mission is open (the initial screen). Examples use fixed sample values, never mission data (D1).
//   When a setter reports that the value could not be saved, a warning is shown; the value still applies.
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../hooks/useSettings';
import type { CoordinateFormatSetting } from '../types/mission';
import { formatCoordinate, resolveCoordinateFormat } from '../utils/coordinates';
import {
  formatAltitude,
  formatDistance,
  formatPressure,
  formatSpeed,
  formatTemperature,
  pressureValuesFromMmHg,
} from '../utils/units';
import { Notice } from './Notice';
import { Segmented } from './Segmented';
import type { SegmentedOption } from './Segmented';

export interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
}

const COORDINATE_FORMATS = ['DDM', 'DMS', 'MGRS', 'DEC', 'aircraft'] as const satisfies readonly CoordinateFormatSetting[];

/** Fixed sample values for the live examples under each setting. */
const EXAMPLE_ALTITUDE_M = 1000;
const EXAMPLE_SPEED_MS = 100;
const EXAMPLE_DISTANCE_M = 10000;
const EXAMPLE_TEMPERATURE_C = 15;
const EXAMPLE_PRESSURE_MMHG = 760;
const EXAMPLE_LATLON: [number, number] = [42.5, 43.25];

interface ChoiceRowProps<T extends string> {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  example?: string;
}

/**
 * A setting with a few choices: the label sits above the buttons, the example below.
 * The row is the one group for the setting: it is named by its label and described by its
 * example, so a screen reader reads the name once and then the example. The buttons inside
 * are a Segmented with an empty label, so the same name is not announced twice.
 */
function ChoiceRow<T extends string>({ label, options, value, onChange, example }: ChoiceRowProps<T>) {
  const labelId = useId();
  const hintId = useId();
  return (
    <div
      className="settings-row"
      role="group"
      aria-labelledby={labelId}
      aria-describedby={example ? hintId : undefined}
    >
      <span className="field-label" id={labelId}>{label}</span>
      <Segmented label="" options={options} value={value} onChange={onChange} />
      {example && <p className="field-hint" id={hintId}>{example}</p>}
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section className="settings-section" aria-labelledby={titleId}>
      <h3 id={titleId} className="settings-section-title">{title}</h3>
      {children}
    </section>
  );
}

export default function SettingsDrawer({ open, onClose }: SettingsDrawerProps) {
  const { t } = useTranslation('settings');
  const {
    settings,
    setAltitudeUnit,
    setSpeedUnit,
    setDistanceUnit,
    setPressureUnit,
    setTemperatureUnit,
    setCoordinateFormat,
    setTimeDisplay,
    setWindDisplay,
    setLanguage,
    setTheme,
    setFontScale,
    setMapBackground,
    resetDisplaySettings,
  } = useSettings();
  const titleId = useId();
  const coordinateSelectId = useId();
  const coordinateHintId = useId();
  const resetHintId = useId();
  const [saveFailed, setSaveFailed] = useState(false);
  // Every setter returns whether the value was saved. A failed save still changes the screen,
  // so only the warning is raised here.
  const remember = (saved: boolean) => setSaveFailed(!saved);
  const closeRef = useRef<HTMLButtonElement>(null);
  // The latest onClose is read from a ref, so a parent that passes a new function on each
  // render does not re-run the focus effect (which would pull focus back to the close button).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onCloseRef.current();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  // Temporary bridge (P8). The map screens (MapTab, RevisionMap) do not read settings.mapBackground
  // yet, so the setting is written to a root attribute that settings.css uses to hide the Leaflet
  // tiles. Remove this once P2's MapPanel reads the setting directly. Both shells mount the drawer,
  // so the attribute follows the setting on every screen, whether the drawer is open or not.
  const mapBackground = settings.mapBackground;
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.mapBackground = mapBackground ? 'shown' : 'hidden';
    return () => {
      delete root.dataset.mapBackground;
    };
  }, [mapBackground]);

  if (!open) return null;

  const coordinateLabels: Record<CoordinateFormatSetting, string> = {
    DDM: t('settings:coordinate.DDM'),
    DMS: t('settings:coordinate.DMS'),
    MGRS: t('settings:coordinate.MGRS'),
    DEC: t('settings:coordinate.DEC'),
    aircraft: t('settings:coordinate.aircraft'),
  };
  const coordinateExample = formatCoordinate(
    EXAMPLE_LATLON[0],
    EXAMPLE_LATLON[1],
    resolveCoordinateFormat(settings.coordinateFormat),
  );

  return (
    <aside className="settings-drawer" role="dialog" aria-modal="false" aria-labelledby={titleId}>
      <header className="settings-drawer-header">
        <h2 id={titleId}>{t('settings:title')}</h2>
        <button ref={closeRef} type="button" className="btn btn-secondary" onClick={onClose}>
          {t('settings:close')}
        </button>
      </header>
      <p className="settings-drawer-note">{t('settings:intro')}</p>
      {saveFailed && <Notice tone="warning">{t('settings:unsaved')}</Notice>}

      <SettingsSection title={t('settings:section.units')}>
        <ChoiceRow
          label={t('settings:altitude')}
          value={settings.altitudeUnit}
          onChange={value => remember(setAltitudeUnit(value))}
          options={[{ value: 'm', label: 'm' }, { value: 'ft', label: 'ft' }]}
          example={t('settings:example', { value: formatAltitude(EXAMPLE_ALTITUDE_M, settings.altitudeUnit) })}
        />
        <ChoiceRow
          label={t('settings:speed')}
          value={settings.speedUnit}
          onChange={value => remember(setSpeedUnit(value))}
          options={[{ value: 'kt', label: 'kt' }, { value: 'kmh', label: 'km/h' }]}
          example={t('settings:example', { value: formatSpeed(EXAMPLE_SPEED_MS, settings.speedUnit) })}
        />
        <ChoiceRow
          label={t('settings:distance')}
          value={settings.distanceUnit}
          onChange={value => remember(setDistanceUnit(value))}
          options={[{ value: 'nm', label: 'nm' }, { value: 'km', label: 'km' }]}
          example={t('settings:example', { value: formatDistance(EXAMPLE_DISTANCE_M, settings.distanceUnit) })}
        />
        <ChoiceRow
          label={t('settings:pressure')}
          value={settings.pressureUnit}
          onChange={value => remember(setPressureUnit(value))}
          options={[{ value: 'hPa', label: 'hPa' }, { value: 'inHg', label: 'inHg' }, { value: 'mmHg', label: 'mmHg' }]}
          example={t('settings:example', {
            value: formatPressure(pressureValuesFromMmHg(EXAMPLE_PRESSURE_MMHG), settings.pressureUnit),
          })}
        />
        <ChoiceRow
          label={t('settings:temperature')}
          value={settings.temperatureUnit}
          onChange={value => remember(setTemperatureUnit(value))}
          options={[{ value: 'C', label: '°C' }, { value: 'F', label: '°F' }]}
          example={t('settings:example', { value: formatTemperature(EXAMPLE_TEMPERATURE_C, settings.temperatureUnit) })}
        />
      </SettingsSection>

      <SettingsSection title={t('settings:section.coordinateTime')}>
        <div className="settings-row">
          <label className="field-label" htmlFor={coordinateSelectId}>{t('settings:coordinate.label')}</label>
          <select
            id={coordinateSelectId}
            className="settings-select"
            aria-describedby={coordinateHintId}
            value={settings.coordinateFormat}
            onChange={event => {
              const format = COORDINATE_FORMATS.find(item => item === event.target.value);
              if (format) remember(setCoordinateFormat(format));
            }}
          >
            {COORDINATE_FORMATS.map(format => (
              <option key={format} value={format}>{coordinateLabels[format]}</option>
            ))}
          </select>
          <p className="field-hint" id={coordinateHintId}>{t('settings:example', { value: coordinateExample })}</p>
        </div>
        <ChoiceRow
          label={t('settings:time.label')}
          value={settings.timeDisplay}
          onChange={value => remember(setTimeDisplay(value))}
          options={[
            { value: 'local', label: t('settings:time.local') },
            { value: 'zulu', label: t('settings:time.zulu') },
            { value: 'both', label: t('settings:time.both') },
          ]}
        />
        <ChoiceRow
          label={t('settings:wind.label')}
          value={settings.windDisplay}
          onChange={value => remember(setWindDisplay(value))}
          options={[
            { value: 'from', label: t('settings:wind.from') },
            { value: 'to', label: t('settings:wind.to') },
            { value: 'both', label: t('settings:wind.both') },
          ]}
        />
      </SettingsSection>

      <SettingsSection title={t('settings:section.display')}>
        <ChoiceRow
          label={t('settings:language.label')}
          value={settings.language}
          onChange={value => remember(setLanguage(value))}
          options={[{ value: 'ja', label: t('settings:language.ja') }, { value: 'en', label: t('settings:language.en') }]}
        />
        <ChoiceRow
          label={t('settings:theme.label')}
          value={settings.theme}
          onChange={value => remember(setTheme(value))}
          options={[
            { value: 'ffs', label: t('settings:theme.ffs') },
            { value: 'standard', label: t('settings:theme.standard') },
            { value: 'night', label: t('settings:theme.night') },
          ]}
        />
        <ChoiceRow
          label={t('settings:fontScale.label')}
          value={settings.fontScale}
          onChange={value => remember(setFontScale(value))}
          options={[
            { value: 'standard', label: t('settings:fontScale.standard') },
            { value: 'large', label: t('settings:fontScale.large') },
          ]}
        />
      </SettingsSection>

      <SettingsSection title={t('settings:section.map')}>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.mapBackground}
            onChange={event => remember(setMapBackground(event.target.checked))}
          />
          <span>{t('settings:mapBackground.show')}</span>
        </label>
      </SettingsSection>

      <div className="settings-reset-block">
        <p className="field-hint" id={resetHintId}>{t('settings:resetNote')}</p>
        <button
          type="button"
          className="btn btn-secondary settings-reset"
          aria-describedby={resetHintId}
          onClick={() => remember(resetDisplaySettings())}
        >
          {t('settings:reset')}
        </button>
      </div>
    </aside>
  );
}
