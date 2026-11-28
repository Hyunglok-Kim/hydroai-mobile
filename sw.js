/* HydroAI 모바일 서비스워커 — 목적은 오프라인이 아니라 **갱신 보장**이다.
   iOS 홈 화면 앱(standalone)은 자기 캐시를 따로 오래 들고 있어, 고친 코드가 폰에
   영영 안 내려가는 일이 있었다(2026-08-15). 그래서 전략은 network-first:
   항상 서버를 먼저 보고, 네트워크가 죽었을 때만 마지막으로 받아둔 사본을 쓴다. */
const CACHE = "hydroai-mobile-v1";

self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k !== CACHE) await caches.delete(k);
    }
    await self.clients.claim();          // 열려 있는 탭에 바로 적용
  })());
});

/* 조각 데이터 파일(p/이름.<내용해시8>.json) — 내용이 바뀌면 이름이 바뀌는 불변 파일.
   이것만은 캐시 우선: network-first 로 매번 다시 받으면 조각 발행의 의미(바뀐 것만
   내려받기)가 사라진다. 코드(m.js 등)는 그대로 network-first — 갱신 보장이 목적. */
const IMMUTABLE = /\/p\/[^/]+\.[0-9a-f]{8}\.(enc\.)?json$/;

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    if (IMMUTABLE.test(new URL(req.url).pathname)) {
      const hit = await caches.match(req);
      if (hit) return hit;
      const fresh = await fetch(req);
      if (fresh && fresh.ok) {
        const c = await caches.open(CACHE);
        c.put(req, fresh.clone());
      }
      return fresh;
    }
    try {
      const fresh = await fetch(req, { cache: "no-store" });   // 서버 먼저
      if (fresh && fresh.ok) {
        const c = await caches.open(CACHE);
        c.put(req, fresh.clone());
      }
      return fresh;
    } catch {
      const hit = await caches.match(req, { ignoreSearch: true });  // 오프라인 대비
      if (hit) return hit;
      throw new Error("offline");
    }
  })());
});
