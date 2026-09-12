// components/NotificationBell.tsx
// The bell icon in both the admin/staff dashboard and the teacher portal used to
// be purely decorative — no data behind it, always showing the same static dot.
// This makes it real: polls GET /communication/notifications (tenant + audience
// scoped announcements, including ones an owner cross-tenant broadcast writes
// into the recipient's own tenant — see AdminController.sendBroadcast), shows an
// unread badge, and marks items read on open.
'use client';
import { useState, useEffect, useRef } from 'react';
import { Bell, X } from 'lucide-react';
import apiClient from '@/lib/api/client';

type Notification = {
  id: string;
  title: string;
  body: string;
  priority: string;
  createdAt: string;
  isRead: boolean;
};

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-amber-500',
  normal: 'bg-blue-500',
  low: 'bg-gray-400',
};

export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = () => {
    apiClient.get('/communication/notifications')
      .then(r => { setItems(r.data?.notifications || []); setUnreadCount(r.data?.unreadCount || 0); })
      .catch(() => {});
  };

  useEffect(() => {
    load();
    // Polling, not a websocket — good enough for an announcement feed that
    // changes a handful of times a day, not a live chat.
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const markRead = (id: string) => {
    setItems(cur => cur.map(n => n.id === id ? { ...n, isRead: true } : n));
    setUnreadCount(c => Math.max(0, c - 1));
    apiClient.post(`/communication/notifications/${id}/read`).catch(() => {});
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-xl text-theme-muted hover:bg-surface-2 hover:text-theme-heading transition-colors">
        <Bell size={18}/>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[14px] h-[14px] px-[3px] flex items-center justify-center bg-[#f5820a] text-white text-[9px] font-bold rounded-full leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-surface border border-theme rounded-2xl shadow-modal z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-theme">
            <span className="font-bold text-sm text-theme-heading">Notifications</span>
            <button onClick={() => setOpen(false)}><X size={16} className="text-theme-muted"/></button>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-theme">
            {items.length === 0 ? (
              <p className="text-sm text-theme-muted text-center py-8">No notifications yet.</p>
            ) : items.map(n => (
              <button key={n.id} onClick={() => markRead(n.id)}
                className={`w-full text-left px-4 py-3 hover:bg-surface-2 transition-colors ${!n.isRead ? 'bg-surface-2/60' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[n.priority] || PRIORITY_DOT.normal}`}/>
                  <span className={`text-sm ${!n.isRead ? 'font-bold text-theme-heading' : 'font-medium text-theme'}`}>{n.title}</span>
                </div>
                <p className="text-xs text-theme-muted mt-1 line-clamp-2">{n.body}</p>
                <p className="text-[10px] text-theme-muted mt-1">{new Date(n.createdAt).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
