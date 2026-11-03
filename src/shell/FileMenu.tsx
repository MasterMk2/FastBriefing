// STUB. Owner: P6 (記入・改版・ファイル操作・初回画面). P6 keeps this contract and polishes the body.
// Contract (frozen): default export FileMenu, props FileMenuProps below. Rendered in the header ("ファイル ▾").
//   The menu items: 開く（onOpen）, 改版を比べる（onCompare, enabled when a mission is open）,
//   ミッションを閉じる（onClose）. Closing the menu returns focus to its trigger.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface FileMenuProps {
  hasMission: boolean;
  onOpen: () => void;
  onCompare: () => void;
  onClose: () => void;
}

export default function FileMenu({ hasMission, onOpen, onCompare, onClose }: FileMenuProps) {
  const { t } = useTranslation('shell');
  const [open, setOpen] = useState(false);

  const choose = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div className="file-menu">
      <button
        type="button"
        className="btn btn-secondary file-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
      >
        {t('shell:file.label')} ▾
      </button>
      {open && (
        <div className="file-menu-list" role="menu">
          <button type="button" role="menuitem" className="file-menu-item" onClick={() => choose(onOpen)}>{t('shell:file.open')}</button>
          <button type="button" role="menuitem" className="file-menu-item" disabled={!hasMission} onClick={() => choose(onCompare)}>{t('shell:file.compare')}</button>
          <button type="button" role="menuitem" className="file-menu-item" disabled={!hasMission} onClick={() => choose(onClose)}>{t('shell:file.close')}</button>
        </div>
      )}
    </div>
  );
}
