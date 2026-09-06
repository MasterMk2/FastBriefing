import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { DisplaySettings } from '../types/mission';

const DEFAULT_SETTINGS: DisplaySettings = {
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
  const [settings, setSettings] = useState<DisplaySettings>(() => {
    const saved = localStorage.getItem('fastbriefing-settings');
    if (saved) {
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      } catch {
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  });
  
  useEffect(() => {
    localStorage.setItem('fastbriefing-settings', JSON.stringify(settings));
  }, [settings]);
  
  const updateSetting = (key: keyof DisplaySettings, value: DisplaySettings[keyof DisplaySettings]) => {
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