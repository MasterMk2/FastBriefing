import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export type NoticeTone = 'info' | 'warning' | 'error' | 'success';

const SYMBOLS: Record<NoticeTone, string> = {
  info: 'i',
  warning: '▲',
  error: '×',
  success: '✓',
};

/**
 * Status line with a symbol and a text label. Every tone carries both, so the
 * state survives without colour (SPEC 4.2).
 */
export function Notice({ tone, title, children }: { tone: NoticeTone; title?: string; children?: ReactNode }) {
  const { t } = useTranslation('shell');
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="notice-symbol" aria-hidden="true">{SYMBOLS[tone]}</span>
      <div className="notice-body">
        <span className="visually-hidden">{t(`notice.${tone}`)}</span>
        {title && <p className="notice-title">{title}</p>}
        {children}
      </div>
    </div>
  );
}
