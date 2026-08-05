self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }

  const title = payload.title || '🚨 ¡Descanso terminado!';
  const options = {
    body: payload.body || 'Vuelve ahora para hacer la siguiente serie.',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: payload.tag || 'modo-brigido-rest-timer',
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [500, 100, 500, 100, 900, 150, 500, 100, 500, 100, 1200],
    data: { url: payload.url || self.registration.scope, jobId: payload.jobId || null },
    actions: [{ action: 'open-timer', title: 'Abrir Modo Brígido' }]
  };

  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visibleClient = clientsList.find((client) => client.visibilityState === 'visible');
    if (visibleClient) {
      visibleClient.postMessage({ type: 'timer-push-received', payload });
      return;
    }
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || self.registration.scope;
  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windowClients) {
      if ('navigate' in client && client.url !== targetUrl) {
        try { await client.navigate(targetUrl); } catch { /* mantener ventana */ }
      }
      if ('focus' in client) { await client.focus(); return; }
    }
    if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
  })());
});
