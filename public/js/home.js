// 列表页逻辑：分类/类型/搜索筛选 + 我的发布/我的收藏 + 骨架屏 + 分页加载
// v0.7.2：筛选状态同步 URL（可分享 / 刷新保留）、结果计数条、空态区分、加载到底提示
const api = new ApiClient();

// mode: all 全部 | mine 我的发布 | fav 我的收藏
const state = {
  type: "", category: "", circle: "", q: "", sort: "newest",
  mode: "all", offset: 0, limit: 30, total: 0, loading: false,
};

const $ = sel => document.querySelector(sel);
const SORTS = ["newest", "price_asc", "price_desc"];

// ===== 状态 ↔ URL =====
// 让筛选条件可分享、可刷新保留（replaceState：不往历史里堆记录）
function readUrlState() {
  const p = new URL(location.href).searchParams;
  const mode = p.get("mode");
  if (mode === "mine" || mode === "fav") state.mode = mode;
  const cat = p.get("category");
  if (CATEGORIES.includes(cat)) state.category = cat;
  const t = p.get("type");
  if (TYPE_LABELS[t]) state.type = t;
  state.circle = p.get("community") || "";
  state.q = p.get("q") || "";
  const s = p.get("sort");
  if (SORTS.includes(s)) state.sort = s;
}

function syncUrl() {
  const p = new URLSearchParams();
  if (state.mode !== "all") p.set("mode", state.mode);
  if (state.type) p.set("type", state.type);
  if (state.category) p.set("category", state.category);
  if (state.circle) p.set("community", state.circle);
  if (state.q) p.set("q", state.q);
  if (state.sort !== "newest") p.set("sort", state.sort);
  const qs = p.toString();
  try {
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
  } catch {}
}

function hasFilter() {
  return !!(state.type || state.category || state.circle || state.q);
}

function buildQuery() {
  const p = new URLSearchParams();
  if (state.type) p.set("type", state.type);
  if (state.category) p.set("category", state.category);
  if (state.circle) p.set("community", state.circle);
  if (state.q) p.set("q", state.q);
  if (state.sort) p.set("sort", state.sort);
  if (state.mode === "mine") p.set("owner", getClientId());
  p.set("limit", state.limit);
  p.set("offset", state.offset);
  return p.toString();
}

const SKELETONS = `<div class="card skel"><div class="thumb"></div><div class="body">
  <div class="sk-line w80"></div><div class="sk-line w40"></div><div class="sk-line w60"></div>
</div></div>`.repeat(6);

// 加载更多按钮 + 到底提示
function renderMore(hasMore, count) {
  const wrap = $("#moreWrap");
  wrap.style.display = hasMore ? "block" : "none";
  $("#moreBtn").disabled = false;
  $("#moreBtn").textContent = "加载更多";
  // 只有翻过页（总数超过一屏）且已取完才提示到底，避免一屏内容也喊「到底啦」
  const reachedEnd = !hasMore && count > 0 && state.total > state.limit;
  $("#listEnd").hidden = !reachedEnd;
}

function emptyHtml() {
  if (state.mode === "mine") return `<div class="empty"><div class="big">🗂</div>还没有发布过物品<br>点右上角「发布」试试</div>`;
  if (state.mode === "fav") return `<div class="empty"><div class="big">⭐</div>还没有收藏<br>在物品详情页点「收藏」吧</div>`;
  // 有筛选条件时的空结果，与「整个频道还没东西」区分开
  if (hasFilter()) {
    return `<div class="empty"><div class="big">🔍</div>没有找到符合条件的物品<br>
      <span class="empty-hint">换个关键词，或放宽筛选条件</span><br>
      <button class="btn btn-clear" id="emptyClear">清空筛选条件</button></div>`;
  }
  return `<div class="empty"><div class="big">📭</div>这里还没有物品<br>点右上角「发布」第一个吧</div>`;
}

// 结果计数条：让人一眼知道「筛出来多少件」
function renderCount() {
  const bar = $("#resultBar");
  if (!bar) return;
  const n = state.total;
  let text;
  if (state.mode === "mine") text = `我的发布 · 共 ${n} 件`;
  else if (state.mode === "fav") text = `我的收藏 · 共 ${n} 件`;
  else if (hasFilter()) {
    const bits = [];
    if (state.q) bits.push(`“${state.q}”`);
    if (state.type) bits.push(TYPE_LABELS[state.type]);
    if (state.category) bits.push(state.category);
    if (state.circle) bits.push(state.circle);
    text = `找到 ${n} 件 · ${bits.join(" · ")}`;
  } else text = `最新闲置 · 共 ${n} 件`;

  bar.textContent = text;
  bar.hidden = false;
  if (state.mode !== "fav" && hasFilter()) {
    const btn = document.createElement("button");
    btn.className = "link-btn";
    btn.id = "clearFilters";
    btn.textContent = "清空筛选";
    btn.addEventListener("click", clearFilters);
    bar.appendChild(btn);
  }
}

async function load(reset) {
  if (state.loading) return;
  if (reset) {
    state.offset = 0;
    $("#list").innerHTML = SKELETONS; // 骨架屏占位
    $("#listEnd").hidden = true;
  }
  state.loading = true;
  try {
    // 收藏模式走独立接口（v0.7.2 起同样支持分类/类型/关键词筛选）
    const path = state.mode === "fav"
      ? `/api/favorites?${buildQuery()}&clientId=${encodeURIComponent(getClientId())}`
      : "/api/items?" + buildQuery();
    const data = await api.get(path);
    state.total = data.total || 0;
    const items = data.items || [];
    if (reset && items.length === 0) {
      $("#list").innerHTML = emptyHtml();
    } else {
      if (reset) $("#list").innerHTML = "";
      $("#list").insertAdjacentHTML("beforeend", items.map(cardHtml).join(""));
    }
    renderCount();
    renderMore(state.offset + items.length < state.total, state.offset + items.length);
  } catch (e) {
    if (reset) {
      $("#list").innerHTML = `<div class="empty">加载失败：${escapeHtml(e.message)}</div>`;
      $("#resultBar").hidden = true;
    }
    showToast("加载失败：" + e.message, "error");
  } finally {
    state.loading = false;
  }
}

// ===== 筛选交互 =====
function setMode(mode) {
  state.mode = mode;
  $("#mineBtn").classList.toggle("active", mode === "mine");
  $("#favBtn").classList.toggle("active", mode === "fav");
  syncUrl();
  load(true);
}

function clearFilters() {
  state.type = ""; state.category = ""; state.circle = ""; state.q = ""; state.sort = "newest";
  $("#searchInput").value = "";
  $("#categorySelect").value = "";
  $("#circleSelect").value = "";
  $("#sortSelect").value = "newest";
  document.querySelectorAll("#typeChips .chip").forEach(c =>
    c.classList.toggle("active", !c.dataset.type));
  syncUrl();
  load(true);
}

// 把 URL 里读到的状态回填到控件，避免「筛选生效但界面没反应」
function applyStateToUi() {
  if (state.type) {
    document.querySelectorAll("#typeChips .chip").forEach(c =>
      c.classList.toggle("active", (c.dataset.type || "") === state.type));
  }
  $("#searchInput").value = state.q;
  $("#sortSelect").value = state.sort;
}

function initFilters() {
  // 分类下拉
  const sel = $("#categorySelect");
  CATEGORIES.forEach(c => {
    const o = document.createElement("option");
    o.value = c; o.textContent = c;
    sel.appendChild(o);
  });
  sel.value = state.category;

  // 圈子下拉（活跃圈子聚合；支持 ?community= 直达）
  const circleSel = $("#circleSelect");
  api.get("/api/communities").then(d => {
    (d.communities || []).forEach(c => {
      const o = document.createElement("option");
      o.value = c.name;
      o.textContent = `${c.name} (${c.count})`;
      circleSel.appendChild(o);
    });
    // 直达的圈子若不在活跃列表（如已无在售），补一项，否则筛选条件会被静默丢掉
    if (state.circle) {
      if (!Array.from(circleSel.options).some(o => o.value === state.circle)) {
        const o = document.createElement("option");
        o.value = state.circle;
        o.textContent = state.circle;
        circleSel.appendChild(o);
      }
      circleSel.value = state.circle;
    }
  }).catch(() => {});

  applyStateToUi();

  $("#typeChips").addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    document.querySelectorAll("#typeChips .chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    state.type = chip.dataset.type || "";
    syncUrl();
    load(true);
  });

  sel.addEventListener("change", () => { state.category = sel.value; syncUrl(); load(true); });
  circleSel.addEventListener("change", () => { state.circle = circleSel.value; syncUrl(); load(true); });
  $("#sortSelect").addEventListener("change", e => { state.sort = e.target.value; syncUrl(); load(true); });

  const doSearch = () => { state.q = $("#searchInput").value.trim(); syncUrl(); load(true); };
  $("#searchBtn").addEventListener("click", doSearch);
  $("#searchInput").addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });

  $("#moreBtn").addEventListener("click", () => {
    state.offset += state.limit;
    $("#moreBtn").disabled = true;
    $("#moreBtn").textContent = "加载中…";
    load(false);
  });

  $("#mineBtn").addEventListener("click", () => {
    if (state.mode !== "mine" && !requireLogin("/index.html?mode=mine")) return;
    setMode(state.mode === "mine" ? "all" : "mine");
  });
  $("#favBtn").addEventListener("click", () => {
    if (state.mode !== "fav" && !requireLogin("/index.html?mode=fav")) return;
    setMode(state.mode === "fav" ? "all" : "fav");
  });

  // 消息需登录
  $("#msgBtn").addEventListener("click", e => {
    if (!requireLogin("/messages.html")) e.preventDefault();
  });

  // 卡片跳转详情；空态里的「清空筛选」就地重置
  $("#list").addEventListener("click", e => {
    if (e.target.closest("#emptyClear")) { clearFilters(); return; }
    const card = e.target.closest(".card");
    if (card) location.href = `/item.html?id=${card.dataset.id}`;
  });
}

readUrlState();
initFilters();
if (state.mode !== "all") setMode(state.mode);
else load(true);
updateAccountSlot();
if (isLoggedIn()) fetchUnreadBadge();

// ===== 消息未读角标 =====
function fetchUnreadBadge() {
  api.get("/api/threads?clientId=" + encodeURIComponent(getClientId()) + "&limit=1")
    .then(d => {
      const n = d.totalUnread || 0;
      const btn = $("#msgBtn");
      if (!btn) return;
      btn.innerHTML = n > 0 ? `消息<span class="unread-dot">${n > 99 ? "99+" : n}</span>` : "消息";
    })
    .catch(() => {});
}

// ===== 账号入口（顶栏右侧醒目按钮）=====
function updateAccountSlot() {
  const el = $("#accountSlot");
  if (!el) return;
  const p = getProfile();
  if (p.accounted && p.nickname) {
    el.innerHTML = `<span class="user-chip" title="已登录">👤 ${escapeHtml(p.nickname)}</span>` +
      `<button class="btn-logout" id="logoutLink">退出</button>`;
    el.querySelector("#logoutLink").addEventListener("click", () => {
      if (!confirm("退出将切换到新的匿名身份；原账号随时可用账号 + 密码登录找回。确定退出？")) return;
      localStorage.removeItem("idle_client_id");
      setProfile({});
      getClientId();
      location.reload();
    });
  } else {
    el.innerHTML = `<a class="btn-login" id="loginCta" href="/auth.html">登录 / 注册</a>`;
  }
}
