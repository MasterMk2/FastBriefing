import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { DisplaySettings } from '../types/mission';
import i18n, {
  DEFAULT_LANGUAGE,
  SETTINGS_STORAGE_KEY as I18N_SETTINGS_STORAGE_KEY,
  SETTINGS_VERSION as I18N_SETTINGS_VERSION,
  SUPPORTED_LANGUAGES,
} from '../i18n';

export const SETTINGS_STORAGE_KEY = I18N_SETTINGS_STORAGE_KEY;
export const SETTINGS_VERSION = I18N_SETTINGS_VERSION;
export const THEMES = ['default', 'ffs'] as const;

export const DEFAULT_SETTINGS: Readonly<DisplaySettings> = {
  coordinateFormat: 'DDM',
  unitSystem: 'metric',
  altitudeUnit: 'm',
  speedUnit: 'kt',
  distanceUnit: 'nm',
  pressureUnit: 'hPa',
  temperatureUnit: 'C',
  viewMode: 'pilot',
  language: DEFAULT_LANGUAGE,
  outputLanguage: DEFAULT_LANGUAGE,
  theme: 'ffs',
};

export type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

const COORDINATE_FORMATS = ['DDM', 'DMS', 'MGRS', 'DEC'] as const;
const UNIT_SYSTEMS = ['metric', 'imperial'] as const;
const ALTITUDE_UNITS = ['ft', 'm'] as const;
const SPEED_UNITS = ['kt', 'kmh'] as const;
const DISTANCE_UNITS = ['nm', 'km'] as const;
const PRESSURE_UNITS = ['hPa', 'inHg', 'mmHg'] as const;
const TEMPERATURE_UNITS = ['C', 'F'] as const;
const VIEW_MODES = ['creator', 'pilot'] as const;
const LANGUAGES = SUPPORTED_LANGUAGES;

function getStorage(): SettingsStorage | null {
  try {
    if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) return null;
    return globalThis.localStorage;
  } catch {
    console.warn('FastBriefing settings storage is unavailable; using default settings.');
    return null;
  }
}

function cloneDefaultSettings(): DisplaySettings {
  return { ...DEFAULT_SETTINGS };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function enumOrDefault<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback;
}

function validateSettings(value: Record<string, unknown>): DisplaySettings {
  return {
    coordinateFormat: enumOrDefault(value.coordinateFormat, COORDINATE_FORMATS, DEFAULT_SETTINGS.coordinateFormat),
    unitSystem: enumOrDefault(value.unitSystem, UNIT_SYSTEMS, DEFAULT_SETTINGS.unitSystem),
    altitudeUnit: enumOrDefault(value.altitudeUnit, ALTITUDE_UNITS, DEFAULT_SETTINGS.altitudeUnit),
    speedUnit: enumOrDefault(value.speedUnit, SPEED_UNITS, DEFAULT_SETTINGS.speedUnit),
    distanceUnit: enumOrDefault(value.distanceUnit, DISTANCE_UNITS, DEFAULT_SETTINGS.distanceUnit),
    pressureUnit: enumOrDefault(value.pressureUnit, PRESSURE_UNITS, DEFAULT_SETTINGS.pressureUnit),
    temperatureUnit: enumOrDefault(value.temperatureUnit, TEMPERATURE_UNITS, DEFAULT_SETTINGS.temperatureUnit),
    viewMode: enumOrDefault(value.viewMode, VIEW_MODES, DEFAULT_SETTINGS.viewMode),
    language: enumOrDefault(value.language, LANGUAGES, DEFAULT_SETTINGS.language),
    outputLanguage: enumOrDefault(value.outputLanguage, LANGUAGES, DEFAULT_SETTINGS.outputLanguage),
    // Unknown or missing theme values fall back to the default theme (FFS).
    theme: enumOrDefault(value.theme, THEMES, DEFAULT_SETTINGS.theme),
  };
}

/**
 * Deserialize the versioned settings envelope.  Keeping this as a separate
 * migration boundary makes adding a future version explicit instead of
 * silently accepting an incompatible shape.
 */
export function migrateSettings(value: unknown): DisplaySettings {
  if (!isRecord(value)) {
    console.warn('FastBriefing settings are not an object; resetting to defaults.');
    return cloneDefaultSettings();
  }

  switch (value.settingsVersion) {
    case SETTINGS_VERSION:
      return validateSettings(value);
    case 1:
      // v1 records predate the FFS default: a stored 'default' cannot be told
      // apart from an implicit choice, so migrate every v1 record to 'ffs'
      // while preserving the other validated fields. Explicit 'default'
      // choices made afterwards (v2) are respected by validateSettings.
      return { ...validateSettings(value), theme: 'ffs' };
    default:
      console.warn('FastBriefing settings version is missing or unsupported; resetting to defaults.');
      return cloneDefaultSettings();
  }
}

export function loadSettings(storage: SettingsStorage | null = getStorage()): DisplaySettings {
  if (!storage) return cloneDefaultSettings();

  let serialized: string | null;
  try {
    serialized = storage.getItem(SETTINGS_STORAGE_KEY);
  } catch {
    console.warn('FastBriefing settings could not be read; using default settings.');
    return cloneDefaultSettings();
  }

  if (serialized === null) return cloneDefaultSettings();

  try {
    return migrateSettings(JSON.parse(serialized) as unknown);
  } catch {
    console.warn('FastBriefing settings were corrupted; resetting to defaults.');
    return cloneDefaultSettings();
  }
}

export function saveSettings(settings: DisplaySettings, storage: SettingsStorage | null = getStorage()): void {
  if (!storage) return;

  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ settingsVersion: SETTINGS_VERSION, ...settings }));
  } catch {
    console.warn('FastBriefing settings could not be saved; continuing without persistence.');
  }
}

interface SettingsContextType {
  settings: DisplaySettings;
  setCoordinateFormat: (format: DisplaySettings['coordinateFormat']) => void;
  setUnitSystem: (system: DisplaySettings['unitSystem']) => void;
  setAltitudeUnit: (unit: DisplaySettings['altitudeUnit']) => void;
  setSpeedUnit: (unit: DisplaySettings['speedUnit']) => void;
  setDistanceUnit: (unit: DisplaySettings['distanceUnit']) => void;
  setPressureUnit: (unit: DisplaySettings['pressureUnit']) => void;
  setTemperatureUnit: (unit: DisplaySettings['temperatureUnit']) => void;
  setViewMode: (mode: DisplaySettings['viewMode']) => void;
  setLanguage: (lang: DisplaySettings['language']) => void;
  setOutputLanguage: (lang: DisplaySettings['outputLanguage']) => void;
  setTheme: (theme: DisplaySettings['theme']) => void;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<DisplaySettings>(() => loadSettings());

  useEffect(() => {
    void i18n.changeLanguage(settings.language);
  }, [settings.language]);
  
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);
  
  const updateSetting = <Key extends keyof DisplaySettings>(key: Key, value: DisplaySettings[Key]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };
  
  const value: SettingsContextType = {
    settings,
    setCoordinateFormat: (v) => updateSetting('coordinateFormat', v),
    setUnitSystem: (v) => updateSetting('unitSystem', v),
    setAltitudeUnit: (v) => updateSetting('altitudeUnit', v),
    setSpeedUnit: (v) => updateSetting('speedUnit', v),
    setDistanceUnit: (v) => updateSetting('distanceUnit', v),
    setPressureUnit: (v) => updateSetting('pressureUnit', v),
    setTemperatureUnit: (v) => updateSetting('temperatureUnit', v),
    setViewMode: (v) => updateSetting('viewMode', v),
    setLanguage: (v) => updateSetting('language', v),
    setOutputLanguage: (v) => updateSetting('outputLanguage', v),
    setTheme: (v) => updateSetting('theme', v),
  };
  
  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
