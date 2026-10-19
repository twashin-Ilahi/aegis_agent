import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { Btn, Icon } from './parts';
import { engine, fmtTime, useEngine } from './store';
import { AegisMascot } from './AegisMascot';
import { useNotificationManager, type NotificationFilter } from './notificationStore';

/* ---------------- error boundary ---------------- */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fatal" role="alert">
        <h2>Something went wrong</h2>
        <p>
          The app hit an unexpected error. Nothing was sent anywhere and no funds are at risk (this is a simulation). Your data is saved in
          this browser.
        </p>
        <pre className="pre">{this.state.error.message}</pre>
        <div className="row">
          <Btn kind="primary" onClick={() => window.location.reload()}>
            Reload
          </Btn>
          <Btn
            kind="danger"
            onClick={() => {
              engine.resetAll();
              window.location.reload();
            }}
          >
            Reset local data and reload
          </Btn>
        </div>
      </div>
    );
  }
}

/* ---------------- toasts ---------------- */
interface Toast {
  id: string;
  level: 'warn' | 'alert' | 'success';
  text: string;
  time: number;
}

/** Surfaces important engine notifications (not routine info) as dismissible toasts. */
export function Toaster() {
  const e = useEngine();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef<string | null>(e.state.notifications.at(-1)?.id ?? null);
  const list = e.state.notifications;
  const lastId = list.at(-1)?.id ?? null;

  useEffect(() => {
    if (lastId === seen.current) return;
    const idx = seen.current ? list.findIndex((n) => n.id === seen.current) : -1;
    const fresh = (idx >= 0 ? list.slice(idx + 1) : list.slice(-3)).filter((n) => n.level !== 'info');
    seen.current = lastId;
    if (fresh.length === 0) return;
    const add = fresh.slice(-3).map((n) => ({ id: n.id, level: n.level as Toast['level'], text: n.text, time: n.time }));
    setToasts((t) => [...t, ...add].slice(-4));
    for (const a of add) setTimeout(() => setToasts((t) => t.filter((x) => x.id !== a.id)), a.level === 'alert' ? 12000 : 6000);
  }, [lastId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.level}`} role={t.level === 'alert' ? 'alert' : 'status'}>
          <div className="toast-mascot-badge">
            <AegisMascot mood={t.level} size={34} />
          </div>
          <div className="toast-body">
            <div className="toast-meta">
              <span className="toast-author">Aegi</span>
              <small>
                {t.level === 'alert' ? 'Alert' : t.level === 'warn' ? 'Notice' : 'Done'} · {fmtTime(t.time)}
              </small>
            </div>
            <div className="toast-text">{t.text}</div>
          </div>
          <button aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---------------- confirm dialog ---------------- */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.focus();
    const k = (ev: KeyboardEvent) => ev.key === 'Escape' && onCancel();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="scrim" onClick={onCancel}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" onClick={(ev) => ev.stopPropagation()}>
        <h3 id="dlg-t">{title}</h3>
        <div className="modal-b">{children}</div>
        <div className="row end">
          <Btn onClick={onCancel}>Cancel</Btn>
          <button ref={ref} className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- theme ---------------- */
export type ThemeMode = 'system' | 'light' | 'dark';
export function useTheme(): [ThemeMode, () => void] {
  const [mode, setMode] = useState<ThemeMode>(() => {
    try {
      const v = localStorage.getItem('aegis-theme');
      return v === 'light' || v === 'system' ? v : 'dark';
    } catch {
      return 'dark';
    }
  });
  useEffect(() => {
    const el = document.documentElement;
    if (mode === 'system') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', mode);
    try {
      localStorage.setItem('aegis-theme', mode);
    } catch {
      /* ignore */
    }
  }, [mode]);
  return [mode, () => setMode((m) => (m === 'system' ? 'light' : m === 'light' ? 'dark' : 'system'))];
}

export function ThemeButton({ mode, onClick }: { mode: ThemeMode; onClick: () => void }) {
  return (
    <button className="theme" onClick={onClick} title="Change theme" aria-label={`Theme: ${mode}. Click to change`}>
      <Icon name={mode === 'dark' ? 'moon' : mode === 'light' ? 'sun' : 'monitor'} size={15} />
      <span>{mode === 'system' ? 'System theme' : mode === 'light' ? 'Light' : 'Black'}</span>
    </button>
  );
}

/* ---------------- notification centre ---------------- */
export function NotificationBell() {
  const notifs = useNotificationManager();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>('all');

  const toggle = () => {
    setOpen((v) => !v);
  };

  const displayed = notifs.notifications
    .filter((n) => {
      if (filter === 'unread') return !notifs.isRead(n.id);
      if (filter === 'read') return notifs.isRead(n.id);
      return true;
    })
    .slice(-40)
    .reverse();

  return (
    <div className="bell-wrap">
      <button
        className="bell"
        onClick={toggle}
        aria-label={`Notifications, ${notifs.unreadCount} unread`}
        aria-expanded={open}
      >
        <Icon name="bell" size={16} />
        {notifs.unreadCount > 0 && !open && (
          <span className="pip abs">{notifs.unreadCount > 9 ? '9+' : notifs.unreadCount}</span>
        )}
      </button>
      {open && (
        <>
          <div className="bell-scrim" onClick={toggle} />
          <div className="bell-pop" role="dialog" aria-label="Notifications">
            <div className="bell-h">
              <div className="bell-title-wrap">
                <AegisMascot mood={notifs.unreadCount > 0 ? 'info' : 'success'} size={22} animate={false} />
                <b>Notifications</b>
              </div>
              <div className="bell-counts">
                {notifs.unreadCount > 0 ? (
                  <span className="notif-badge unread">{notifs.unreadCount} unread</span>
                ) : (
                  <span className="notif-badge all-read">All read</span>
                )}
                <span className="muted small">· {notifs.totalCount} total</span>
              </div>
            </div>

            <div className="notif-toolbar">
              <div className="notif-tabs" role="tablist" aria-label="Notification filter">
                <button
                  type="button"
                  role="tab"
                  aria-selected={filter === 'all'}
                  className={`notif-tab ${filter === 'all' ? 'active' : ''}`}
                  onClick={() => setFilter('all')}
                >
                  All ({notifs.totalCount})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={filter === 'unread'}
                  className={`notif-tab ${filter === 'unread' ? 'active' : ''}`}
                  onClick={() => setFilter('unread')}
                >
                  Unread ({notifs.unreadCount})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={filter === 'read'}
                  className={`notif-tab ${filter === 'read' ? 'active' : ''}`}
                  onClick={() => setFilter('read')}
                >
                  Read ({notifs.readCount})
                </button>
              </div>

              <div className="notif-actions">
                {notifs.unreadCount > 0 ? (
                  <button
                    type="button"
                    className="notif-btn"
                    onClick={notifs.markAllAsRead}
                    title="Mark all notifications as read"
                  >
                    <Icon name="check" size={12} />
                    <span>Read all</span>
                  </button>
                ) : notifs.totalCount > 0 ? (
                  <button
                    type="button"
                    className="notif-btn"
                    onClick={notifs.markAllAsUnread}
                    title="Mark all notifications as unread"
                  >
                    <Icon name="mail" size={12} />
                    <span>Unread all</span>
                  </button>
                ) : null}
                {notifs.totalCount > 0 && (
                  <button
                    type="button"
                    className="notif-btn notif-btn-clean"
                    onClick={notifs.cleanAll}
                    title="Clean all notifications"
                  >
                    <Icon name="trash" size={12} />
                    <span>Clean all</span>
                  </button>
                )}
              </div>
            </div>

            {displayed.length === 0 ? (
              <div className="empty bell-empty">
                <AegisMascot mood="success" size={44} />
                <span>
                  {notifs.totalCount === 0
                    ? 'You are all caught up. No notifications.'
                    : filter === 'unread'
                    ? 'No unread notifications.'
                    : 'No read notifications.'}
                </span>
                {filter !== 'all' && notifs.totalCount > 0 && (
                  <button
                    type="button"
                    className="btn ghost small notif-show-all-btn"
                    onClick={() => setFilter('all')}
                  >
                    View all notifications
                  </button>
                )}
              </div>
            ) : (
              <ul className="notif-list">
                {displayed.map((n) => {
                  const isRead = notifs.isRead(n.id);
                  return (
                    <li key={n.id} className={`notif-item ${n.level} ${isRead ? 'is-read' : 'is-unread'}`}>
                      <span
                        className={`notif-status-dot ${isRead ? 'dot-read' : 'dot-unread'}`}
                        title={isRead ? 'Read' : 'Unread'}
                        aria-hidden="true"
                      />
                      <div className="notif-content">
                        <div className="notif-meta">
                          <span className={`notif-pill notif-pill-${n.level}`}>{n.level}</span>
                          <span className="t">{fmtTime(n.time)}</span>
                        </div>
                        <div className="notif-text">{n.text}</div>
                      </div>
                      <div className="notif-item-actions">
                        <button
                          type="button"
                          className="notif-icon-btn"
                          onClick={() => notifs.toggleRead(n.id)}
                          title={isRead ? 'Mark as unread' : 'Mark as read'}
                          aria-label={isRead ? 'Mark as unread' : 'Mark as read'}
                        >
                          <Icon name={isRead ? 'mail' : 'check'} size={13} />
                        </button>
                        <button
                          type="button"
                          className="notif-icon-btn notif-clean-item"
                          onClick={() => notifs.cleanOne(n.id)}
                          title="Clean notification"
                          aria-label="Clean notification"
                        >
                          <Icon name="close" size={13} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
