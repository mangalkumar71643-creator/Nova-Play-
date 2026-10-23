// NovaPlay admin alerts (Web Push): shows each alert the server sends, and
// opens the admin panel on the right page when it is tapped.
self.addEventListener("push", function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "NovaPlay", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "NovaPlay", {
      body: data.body || "",
      tag: data.tag || "novaplay",
      renotify: true,
      requireInteraction: true,
      icon: "/invite/novaplay-badge.webp",
      badge: "/invite/novaplay-badge.webp",
      vibrate: [200, 100, 200],
      data: { url: data.url || "/admin.html#problems" },
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || "/admin.html#problems";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf("/admin.html") >= 0) {
          list[i].postMessage({ openTab: url.split("#")[1] || "problems" });
          return list[i].focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
