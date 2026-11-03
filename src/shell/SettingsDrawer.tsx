// STUB. Owner: P8 (表示設定). P8 replaces this file's body (all F1 items, immediate apply, 既定に戻す).
// Contract (frozen): default export SettingsDrawer, props SettingsDrawerProps below.
//   Right drawer (360px; bottom sheet under 768px). Opens from the header button and from the bottom tab sheet.
//   Changes apply immediately (no save button). Esc and the close button call onClose; AppShell returns focus
//   to the trigger. Settings are read and written through useSettings() only.
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../hooks/useSettings';
import { Segmented } from './Segmented';

export interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsDrawer({ open, onClose }: SettingsDrawerProps) {
  const { t } = useTranslation('shell');
  const { settings, setLanguage, setTheme, setFontScale, resetDisplaySettings } = useSettings();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <aside className="settings-drawer" role="dialog" aria-modal="false" aria-label={t('shell:settings.title')}>
      <header className="settings-drawer-header">
        <h2>{t('shell:settings.title')}</h2>
        <button ref={closeRef} type="button" className="btn btn-secondary" onClick={onClose}>{t('shell:settings.close')}</button>
      </header>
      <p className="settings-drawer-note">{t('shell:settings.partial')}</p>
      <div className="settings-drawer-row">
        <span className="field-label">{t('shell:settings.language')}</span>
        <Segmented
          label={t('shell:settings.language')}
          value={settings.language}
          onChange={setLanguage}
          options={[{ value: 'ja', label: t('shell:settings.languageJa') }, { value: 'en', label: t('shell:settings.languageEn') }]}
        />
      </div>
      <div className="settings-drawer-row">
        <span className="field-label">{t('shell:settings.theme')}</span>
        <Segmented
          label={t('shell:settings.theme')}
          value={settings.theme}
          onChange={setTheme}
          options={[
            { value: 'ffs', label: t('shell:settings.themeFfs') },
            { value: 'standard', label: t('shell:settings.themeStandard') },
            { value: 'night', label: t('shell:settings.themeNight') },
          ]}
        />
      </div>
      <div className="settings-drawer-row">
        <span className="field-label">{t('shell:settings.fontScale')}</span>
        <Segmented
          label={t('shell:settings.fontScale')}
          value={settings.fontScale}
          onChange={setFontScale}
          options={[{ value: 'standard', label: t('shell:settings.fontStandard') }, { value: 'large', label: t('shell:settings.fontLarge') }]}
        />
      </div>
      <button type="button" className="btn btn-secondary" onClick={() => resetDisplaySettings()}>{t('shell:settings.reset')}</button>
    </aside>
  );
}
