import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { DisplaySettings } from '../types/mission';

export const SETTINGS_STORAGE_KEY = 'fastbriefing-settings';
export const SETTINGS_VERSION = 1;

export const DEFAULT_SETTINGS: Readonly<DisplaySettings> = {
  coordinateFormat: 'DDM',
  unitSystem: 'metric',
  altitudeUnit: 'm',
  speedUnit: 'kt',
  distanceUnit: 'nm',
  pressureUnit: 'hPa',
  temperatureUnit: 'C',
  viewMode: 'pilot',
  language: 'ja',
  outputLanguage: 'ja',
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
const LANGUAGES = ['ja', 'en'] as const;

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
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<DisplaySettings>(() => loadSettings());
  
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
