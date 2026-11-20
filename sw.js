/* 몽픽 서비스 워커 — 홈 화면 앱 설치 + 최신 화면/데이터 우선
   · HTML·JS·CSS·JSON은 항상 네트워크를 먼저 보고, 오프라인일 때만 캐시를 쓴다
   · 아이콘·정적 이미지만 캐시 우선으로 빠르게 연다 */
const VERSION = 'mongpick-v5';
const SHELL = [
  './',
  './index.html',
  './app.js?v=5',
  './style.css?v=5',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(SHELL).catch(() => null))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isNetworkFirst(url) {
  return /\.(json|js|css|html)$/i.test(url.pathname) || /\/api\//.test(url.pathname);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  /* 결과·데이터·앱 코드 — 네트워크 먼저, 오프라인일 때만 캐시 */
  if (isNetworkFirst(url)) {
    e.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => null);
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || Response.error()))
    );
    return;
  }

  /* 화면 이동 — 네트워크 먼저, 오프라인이면 저장해 둔 첫 화면 */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => null);
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  /* 그 밖의 파일 — 캐시 먼저, 뒤에서 새 판으로 갱신 */
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => null);
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
