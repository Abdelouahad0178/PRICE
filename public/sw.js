// sw.js
self.addEventListener('push', event => {
    const data = event.data.json();
    const title = data.title || 'Nouvelle notification';
    const options = {
      body: data.body,
      icon: '/2025.png'
    };
    event.waitUntil(self.registration.showNotification(title, options));
  });
  