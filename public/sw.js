/* 闲置交换 Service Worker
 *
 * 缓存策略（红线：改任何静态资源后必须递增 CACHE 版本号）：
 *  - 静态页面/资源：network-first（保证更新及时），失败回退缓存（离线可用）
 *  - 图片 /api/files/*：cache-first（key 唯一且不可变，可放心长缓存）
 *  - 其它 /api/*：完全不接管，数据永远走网络
 */
const CACHE = "idle-v3";
const SHELL = [
  "/", "/index.html", "/post.html", "/item.html",
  "/messages.html", "/user.html", "/auth.html", "/admin.html",
  "/css/style.css",
  "/js/api.js", "/js/home.js", "/js/post.js", "/js/detail.js",
  "/js/messages.js", "/js/user.js", "/js/auth.js", "/js/admin.js",
  "/favicon.svg", "/manifest.json",
  "/icons/icon-192.png", "/icons/icon-512.png",
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // 图片：cache-first（不可变资源）
  if (url.pathname.startsWith("/api/files/")) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // 其余 API：不接管
  if (url.pathname.startsWith("/api/")) return;

  // 静态资源 / 页面导航：network-first，离线回退
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() =>
      caches.match(req, { ignoreSearch: true })
        .then(hit => hit || (req.mode === "navigate" ? caches.match("/") : undefined))
    )
  );
});
