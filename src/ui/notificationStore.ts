import { useSyncExternalStore } from 'react';
import { engine, useEngine } from './store';

const STORAGE_KEY = 'aegis-agent:notifications:read:v1';

function getStoredReadIds(): Set<string> {
  try {
    if (typeof window === 'undefined') return new Set();
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function persistReadIds(set: Set<string>) {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
    }
  } catch {
    /* quota or disabled storage */
  }
}

const readIdSet = getStoredReadIds();
const listeners = new Set<() => void>();
let snapshotVersion = 0;

function notifyListeners() {
  persistReadIds(readIdSet);
  snapshotVersion++;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshotVersion;
}

export type NotificationFilter = 'all' | 'unread' | 'read';

export function useNotificationManager() {
  const e = useEngine();
  useSyncExternalStore(subscribe, getSnapshot);

  const all = e.state.notifications;

  const isRead = (id: string) => readIdSet.has(id);

  const markAsRead = (id: string) => {
    if (!readIdSet.has(id)) {
      readIdSet.add(id);
      notifyListeners();
    }
  };

  const markAsUnread = (id: string) => {
    if (readIdSet.has(id)) {
      readIdSet.delete(id);
      notifyListeners();
    }
  };

  const toggleRead = (id: string) => {
    if (readIdSet.has(id)) {
      readIdSet.delete(id);
    } else {
      readIdSet.add(id);
    }
    notifyListeners();
  };

  const markAllAsRead = () => {
    let changed = false;
    for (const n of all) {
      if (!readIdSet.has(n.id)) {
        readIdSet.add(n.id);
        changed = true;
      }
    }
    if (changed) {
      notifyListeners();
    }
  };

  const markAllAsUnread = () => {
    if (readIdSet.size > 0) {
      readIdSet.clear();
      notifyListeners();
    }
  };

  const cleanOne = (id: string) => {
    const idx = e.state.notifications.findIndex((n) => n.id === id);
    if (idx >= 0) {
      e.state.notifications.splice(idx, 1);
      if (readIdSet.has(id)) {
        readIdSet.delete(id);
        persistReadIds(readIdSet);
        snapshotVersion++;
      }
      e.emit();
    }
  };

  const cleanAll = () => {
    if (e.state.notifications.length > 0) {
      e.state.notifications.splice(0, e.state.notifications.length);
      readIdSet.clear();
      notifyListeners();
      e.emit();
    }
  };

  const cleanRead = () => {
    const unreadOnly = e.state.notifications.filter((n) => !readIdSet.has(n.id));
    if (unreadOnly.length !== e.state.notifications.length) {
      e.state.notifications.splice(0, e.state.notifications.length, ...unreadOnly);
      readIdSet.clear();
      notifyListeners();
      e.emit();
    }
  };

  const unreadCount = all.filter((n) => !readIdSet.has(n.id)).length;
  const readCount = all.filter((n) => readIdSet.has(n.id)).length;
  const totalCount = all.length;

  return {
    engine: e,
    notifications: all,
    unreadCount,
    readCount,
    totalCount,
    isRead,
    markAsRead,
    markAsUnread,
    toggleRead,
    markAllAsRead,
    markAllAsUnread,
    cleanOne,
    cleanAll,
    cleanRead,
  };
}

export function cleanAllNotifications() {
  engine.state.notifications.splice(0, engine.state.notifications.length);
  readIdSet.clear();
  notifyListeners();
  engine.emit();
}
