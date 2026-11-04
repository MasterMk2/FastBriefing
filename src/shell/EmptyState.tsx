import type { ReactNode } from 'react';

/** Empty, not-yet-available and no-match states (SPEC 3). Always says what to do next when it can. */
export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <section className="empty-state">
      <h2 className="empty-state-title">{title}</h2>
      {body && <p className="empty-state-body">{body}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </section>
  );
}
