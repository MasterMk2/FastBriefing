import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CoordinateFormatSetting, DisplaySettings, Side, ThemeId } from '../types/mission';
import i18n, {
  DEFAULT_LANGUAGE,
  SETTINGS_STORAGE_KEY as I18N_SETTINGS_STORAGE_KEY,
  SETTINGS_VERSION as I18N_SETTINGS_VERSION,
  SUPPORTED_LANGUAGES,
} from '../i18n';
import {
  DEFAULT_BRIEFING_SECTIONS,
  normalizeBriefingPresets,
  normalizeBriefingSections,
  type BriefingPreset,
  type BriefingSection,
} from '../utils/briefingSections';

export const SETTINGS_STORAGE_KEY = I18N_SETTINGS_STORAGE_KEY;
export const SETTINGS_VERSION = I18N_SETTINGS_VERSION;
export const THEMES = ['ffs', 'standard', 'night'] as const satisfies readonly ThemeId[];
export const FONT_SCALES = ['standard', 'large'] as const;
export const KNEEBOARD_WIDTHS = [1536, 2048, 3072] as const;
export const WIND_DISPLAYS = ['from', 'to', 'both'] as const;
export const TIME_DISPLAYS = ['local', 'zulu', 'both'] as const;

export const DEFAULT_SETTINGS: Readonly<DisplaySettings> = {
  coordinateFormat: 'DDM',
  unitSystem: 'metric',
  altitudeUnit: 'm',
  speedUnit: 'kt',
  distanceUnit: 'nm',
  pressureUnit: 'hPa',
  temperatureUnit: 'C',
  viewMode: 'pilot',
  side: null,
  language: DEFAULT_LANGUAGE,
  outputLanguage: DEFAULT_LANGUAGE,
  theme: 'ffs',
  fontScale: 'standard',
  windDisplay: 'both',
  timeDisplay: 'both',
  mapBackground: true,
  kneeboardWidth: 1536,
  briefingSections: [...DEFAULT_BRIEFING_SECTIONS],
  briefingPresets: [],
};

export type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

const COORDINATE_FORMATS = ['aircraft', 'DDM', 'DMS', 'MGRS', 'DEC'] as const satisfies readonly CoordinateFormatSetting[];
const UNIT_SYSTEMS = ['metric', 'imperial'] as const;
const ALTITUDE_UNITS = ['ft', 'm'] as const;
const SPEED_UNITS = ['kt', 'kmh'] as const;
const DISTANCE_UNITS = ['nm', 'km'] as const;
const PRESSURE_UNITS = ['hPa', 'inHg', 'mmHg'] as const;
const TEMPERATURE_UNITS = ['C', 'F'] as const;
const VIEW_MODES = ['creator', 'pilot'] as const;
const SIDES = ['blue', 'red'] as const satisfies readonly Side[];
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
  return {
    ...DEFAULT_SETTINGS,
    briefingSections: [...DEFAULT_BRIEFING_SECTIONS],
    briefingPresets: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function enumOrDefault<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback;
}

function numberOrDefault<T extends number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'number' && allowed.includes(value as T) ? value as T : fallback;
}

function sideOrNull(value: unknown): Side | null {
  return typeof value === 'string' && SIDES.includes(value as Side) ? value as Side : null;
}

/**
 * Themes stored before v5 used the name 'default' for the light theme. It is
 * renamed to 'standard'; any other unknown value falls back to FFS.
 */
function themeOrDefault(value: unknown): ThemeId {
  const renamed = value === 'default' ? 'standard' : value;
  return enumOrDefault(renamed, THEMES, DEFAULT_SETTINGS.theme);
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
    side: sideOrNull(value.side),
    language: enumOrDefault(value.language, LANGUAGES, DEFAULT_SETTINGS.language),
    outputLanguage: enumOrDefault(value.outputLanguage, LANGUAGES, DEFAULT_SETTINGS.outputLanguage),
    theme: themeOrDefault(value.theme),
    fontScale: enumOrDefault(value.fontScale, FONT_SCALES, DEFAULT_SETTINGS.fontScale),
    windDisplay: enumOrDefault(value.windDisplay, WIND_DISPLAYS, DEFAULT_SETTINGS.windDisplay),
    timeDisplay: enumOrDefault(value.timeDisplay, TIME_DISPLAYS, DEFAULT_SETTINGS.timeDisplay),
    mapBackground: typeof value.mapBackground === 'boolean' ? value.mapBackground : DEFAULT_SETTINGS.mapBackground,
    kneeboardWidth: numberOrDefault(value.kneeboardWidth, KNEEBOARD_WIDTHS, DEFAULT_SETTINGS.kneeboardWidth),
    briefingSections: normalizeBriefingSections(value.briefingSections),
    briefingPresets: normalizeBriefingPresets(value.briefingPresets),
  };
}

function migrateV3Sections(value: unknown): BriefingSection[] {
  const sections: BriefingSection[] = normalizeBriefingSections(value).filter(section => section !== 'notes');
  if (sections.length === 0) return [];
  const overviewIndex = sections.indexOf('overview');
  const insertionIndex = overviewIndex < 0 ? 0 : overviewIndex + 1;
  sections.splice(insertionIndex, 0, 'notes');
  return sections;
}

/**
 * Deserialize the versioned settings envelope.  Keeping this as a separate
 * migration boundary makes adding a future version explicit instead of
 * silently accepting an incompatible shape.
 *
 * v1: every stored theme becomes FFS (a stored 'default' cannot be told apart).
 * v2-v4: fields carry over; the old 'default' theme becomes 'standard'.
 * v5: adds fontScale, side (null = automatic), window and time display, map
 *     background and kneeboard width, each with its default when absent.
 */
export function migrateSettings(value: unknown): DisplaySettings {
  if (!isRecord(value)) {
    console.warn('FastBriefing settings are not an object; resetting to defaults.');
    return cloneDefaultSettings();
  }

  switch (value.settingsVersion) {
    case SETTINGS_VERSION:
    case 4:
    case 2:
      return validateSettings(value);
    case 3:
      return { ...validateSettings(value), briefingSections: migrateV3Sections(value.briefingSections) };
    case 1:
      // v1 records predate the FFS default: a stored 'default' cannot be told
      // apart from an implicit choice, so migrate every v1 record to 'ffs'
      // while preserving the other validated fields.
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

export function saveSettings(settings: DisplaySettings, storage: SettingsStorage | null = getStorage()): boolean {
  if (!storage) return false;

  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ settingsVersion: SETTINGS_VERSION, ...settings }));
    return true;
  } catch {
    console.warn('FastBriefing settings could not be saved; continuing without persistence.');
    return false;
  }
}

interface SettingsContextType {
  settings: DisplaySettings;
  setCoordinateFormat: (format: DisplaySettings['coordinateFormat']) => boolean;
  setUnitSystem: (system: DisplaySettings['unitSystem']) => boolean;
  setAltitudeUnit: (unit: DisplaySettings['altitudeUnit']) => boolean;
  setSpeedUnit: (unit: DisplaySettings['speedUnit']) => boolean;
  setDistanceUnit: (unit: DisplaySettings['distanceUnit']) => boolean;
  setPressureUnit: (unit: DisplaySettings['pressureUnit']) => boolean;
  setTemperatureUnit: (unit: DisplaySettings['temperatureUnit']) => boolean;
  setViewMode: (mode: DisplaySettings['viewMode']) => boolean;
  setSide: (side: Side | null) => boolean;
  setLanguage: (lang: DisplaySettings['language']) => boolean;
  setOutputLanguage: (lang: DisplaySettings['outputLanguage']) => boolean;
  setTheme: (theme: ThemeId) => boolean;
  setFontScale: (scale: DisplaySettings['fontScale']) => boolean;
  setWindDisplay: (display: DisplaySettings['windDisplay']) => boolean;
  setTimeDisplay: (display: DisplaySettings['timeDisplay']) => boolean;
  setMapBackground: (enabled: boolean) => boolean;
  setKneeboardWidth: (width: DisplaySettings['kneeboardWidth']) => boolean;
  setBriefingSections: (sections: BriefingSection[]) => boolean;
  setBriefingPresets: (presets: BriefingPreset[]) => boolean;
  /**
   * Restore the display settings to their defaults ("既定に戻す"). The briefing
   * section order and named presets are kept because they are content, not display.
   */
  resetDisplaySettings: () => boolean;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<DisplaySettings>(() => loadSettings());
  // Several setters can run in one event handler. Reading the latest value from
  // a ref keeps each change from overwriting the one before it.
  const latestRef = useRef(settings);

  useEffect(() => {
    void i18n.changeLanguage(settings.language);
  }, [settings.language]);

  const commit = (next: DisplaySettings): boolean => {
    latestRef.current = next;
    const persisted = saveSettings(next);
    setSettings(next);
    return persisted;
  };

  const updateSetting = <Key extends keyof DisplaySettings>(key: Key, value: DisplaySettings[Key]): boolean =>
    commit({ ...latestRef.current, [key]: value });

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
    setSide: (v) => updateSetting('side', v),
    setLanguage: (v) => updateSetting('language', v),
    setOutputLanguage: (v) => updateSetting('outputLanguage', v),
    setTheme: (v) => updateSetting('theme', v),
    setFontScale: (v) => updateSetting('fontScale', v),
    setWindDisplay: (v) => updateSetting('windDisplay', v),
    setTimeDisplay: (v) => updateSetting('timeDisplay', v),
    setMapBackground: (v) => updateSetting('mapBackground', v),
    setKneeboardWidth: (v) => updateSetting('kneeboardWidth', v),
    setBriefingSections: (v) => updateSetting('briefingSections', normalizeBriefingSections(v)),
    setBriefingPresets: (v) => updateSetting('briefingPresets', normalizeBriefingPresets(v)),
    resetDisplaySettings: () => commit({
      ...cloneDefaultSettings(),
      briefingSections: latestRef.current.briefingSections,
      briefingPresets: latestRef.current.briefingPresets,
    }),
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
