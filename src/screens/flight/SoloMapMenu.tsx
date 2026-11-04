// Owner: P1 (フライト作業画面). "この機だけ地図に" (T12): one disclosure button that opens a single action.
// Used by the rail row and the flight header. It is a disclosure (aria-expanded), not role="menu", so no arrow-key
// menu behaviour is promised. Escape closes it and returns the focus to the button. A press or a focus move outside
// it closes it too (the focus stays where the user put it).
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspace } from '../../shell/workspace';
import { flightKey as buildFlightKey } from '../../utils/flightKey';
import type { FlightKeySide } from '../../utils/flightKey';

interface SoloMapMenuProps {
  side: FlightKeySide;
  groupId: number;
  /** Visible text of the disclosure button. */
  triggerLabel: string;
  /** Accessible name of the disclosure button, when the visible text is not enough. */
  triggerAriaLabel?: string;
  triggerClassName: string;
}

export function SoloMapMenu({ side, groupId, triggerLabel, triggerAriaLabel, triggerClassName }: SoloMapMenuProps) {
  const { t } = useTranslation('flight');
  const { setFlightKey, setMapUi, setScreen } = useWorkspace();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const key = buildFlightKey(side, groupId);

  // While open, a press or a focus move outside the menu closes it. The check is on the target, so a press on the
  // trigger or on the action (both inside the menu) is left to its own handler.
  useEffect(() => {
    if (!open) return undefined;
    const closeIfOutside = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && wrapperRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', closeIfOutside);
    document.addEventListener('focusin', closeIfOutside);
    return () => {
      document.removeEventListener('pointerdown', closeIfOutside);
      document.removeEventListener('focusin', closeIfOutside);
    };
  }, [open]);

  // Selects the flight, limits the map to it, and shows the map. The map offers "全機を表示に戻す" to undo it.
  const showOnlyOnMap = () => {
    setFlightKey(key);
    setMapUi(current => ({ ...current, soloFlightKey: key }));
    setOpen(false);
    setScreen('map');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || !open) return;
    event.stopPropagation();
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="solo-map-menu" ref={wrapperRef} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={triggerAriaLabel}
        onClick={() => setOpen(current => !current)}
      >
        {triggerLabel}
      </button>
      {open && (
        <div id={panelId} className="solo-map-panel">
          <button type="button" className="solo-map-action" onClick={showOnlyOnMap}>
            {t('flight:row.soloMap')}
          </button>
        </div>
      )}
    </div>
  );
}
