const GENERATED_CACHE = "lunwenfix-generated-v2";

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (!url.pathname.includes("/generated/")) return;
  event.respondWith(
    caches.open(GENERATED_CACHE)
      .then(cache => cache.match(event.request, { ignoreSearch: false }))
      .then(response => response || new Response("File expired. Please return to the formatter and generate it again.", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
      }))
  );
});
