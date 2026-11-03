// Owner: P6 (記入・改版・ファイル操作・初回画面). Header menu "ファイル ▾" (SPEC 1.4, F10).
// Contract (frozen): default export FileMenu, props FileMenuProps below. Closing the menu (Esc, a choice,
// an outside press) returns focus to its trigger.
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

export interface FileMenuProps {
  hasMission: boolean;
  onOpen: () => void;
  onCompare: () => void;
  onClose: () => void;
}

const ENABLED_ITEM = '[role="menuitem"]:not(:disabled)';

// onCompare opens the comparison input of App.tsx (the old version, F10). It never opens the plain file pick,
// which would replace the open mission.
export default function FileMenu({ hasMission, onOpen, onCompare, onClose }: FileMenuProps) {
  const { t } = useTranslation('shell');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>(ENABLED_ITEM)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const choose = (action: () => void) => {
    setOpen(false);
    triggerRef.current?.focus();
    action();
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(ENABLED_ITEM));
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    items[(current + delta + items.length) % items.length].focus();
  };

  return (
    <div className="file-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-secondary file-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
      >
        {t('shell:file.label')} ▾
      </button>
      {open && (
        <div className="file-menu-list" role="menu" ref={menuRef} onKeyDown={handleMenuKeyDown}>
          <button type="button" role="menuitem" className="file-menu-item" onClick={() => choose(onOpen)}>
            {t('shell:file.open')}
          </button>
          <button type="button" role="menuitem" className="file-menu-item" disabled={!hasMission} onClick={() => choose(onCompare)}>
            {t('shell:file.compare')}
          </button>
          <button type="button" role="menuitem" className="file-menu-item" disabled={!hasMission} onClick={() => choose(onClose)}>
            {t('shell:file.close')}
          </button>
        </div>
      )}
    </div>
  );
}
