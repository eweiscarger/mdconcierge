// MDconcierge PWA service worker — enables install-to-home-screen + push notifications.
const VERSION = 'mdc-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Minimal fetch handler (presence helps installability); default network behavior.
self.addEventListener('fetch', () => {});

// Push from the engine → show a notification.
self.addEventListener('push', (e) => {
  let data = { title: 'MDconcierge', body: 'New activity', url: '/admin-v2.html' };
  try { if (e.data) data = Object.assign(data, e.data.json()); }
  catch (_) { if (e.data) data.body = e.data.text(); }
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'mdc',
    data: { url: data.url || '/admin-v2.html' }
  }));
});

// Tapping the notification opens / focuses the dashboard.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/admin-v2.html';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if (c.url.includes('admin-v2') && 'focus' in c) return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
