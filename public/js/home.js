// 列表页逻辑：分类/类型/搜索筛选 + 我的发布/我的收藏 + 骨架屏 + 分页加载
const api = new ApiClient();

// mode: all 全部 | mine 我的发布 | fav 我的收藏
const state = {
  type: "", category: "", q: "", sort: "newest",
  mode: "all", offset: 0, limit: 30, total: 0, loading: false,
};

const $ = sel => document.querySelector(sel);

function buildQuery() {
  const p = new URLSearchParams();
  if (state.type) p.set("type", state.type);
  if (state.category) p.set("category", state.category);
  if (state.q) p.set("q", state.q);
  if (state.sort) p.set("sort", state.sort);
  if (state.mode === "mine") p.set("owner", getClientId());
  p.set("limit", state.limit);
  p.set("offset", state.offset);
  return p.toString();
}

function cardHtml(item) {
  const first = item.images && item.images.length ? item.images[0] : null;
  const thumb = first
    ? `<img src="${escapeHtml(first)}" loading="lazy" onerror="this.style.display='none'">`
    : `📦<br>暂无图片`;
  return `
    <div class="card" data-id="${item.id}">
      <div class="thumb">
        ${thumb}
        <span class="badge ${typeBadgeClass(item.type)} badge-float">${TYPE_LABELS[item.type] || ""}</span>
        ${item.status === "sold" ? `<span class="badge badge-sold status-float">已出</span>` : ""}
      </div>
      <div class="body">
        <p class="title">${escapeHtml(item.title)}</p>
        <div class="price">${escapeHtml(formatPrice(item))}</div>
        <div class="meta">
          <span>${escapeHtml(item.community || "—")}</span>
          <span>${escapeHtml(formatTime(item.createdAt))}</span>
        </div>
      </div>
    </div>`;
}

const SKELETONS = `<div class="card skel"><div class="thumb"></div><div class="body">
  <div class="sk-line w80"></div><div class="sk-line w40"></div><div class="sk-line w60"></div>
</div></div>`.repeat(6);

function renderMore(hasMore) {
  const wrap = $("#moreWrap");
  wrap.style.display = hasMore ? "block" : "none";
  $("#moreBtn").disabled = false;
  $("#moreBtn").textContent = "加载更多";
}

function emptyHtml() {
  if (state.mode === "mine") return `<div class="empty"><div class="big">🗂</div>还没有发布过物品<br>点右上角「发布」试试</div>`;
  if (state.mode === "fav") return `<div class="empty"><div class="big">⭐</div>还没有收藏<br>在物品详情页点「收藏」吧</div>`;
  return `<div class="empty"><div class="big">📭</div>这里还没有物品<br>点右上角「发布」第一个吧</div>`;
}

async function load(reset) {
  if (state.loading) return;
  if (reset) {
    state.offset = 0;
    $("#list").innerHTML = SKELETONS; // 骨架屏占位
  }
  state.loading = true;
  try {
    // 收藏模式走独立接口（类型/搜索等筛选由收藏列表本地不支持的项忽略）
    const path = state.mode === "fav"
      ? `/api/favorites?clientId=${encodeURIComponent(getClientId())}&limit=${state.limit}&offset=${state.offset}`
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
    renderMore(state.offset + items.length < state.total);
  } catch (e) {
    if (reset) $("#list").innerHTML = `<div class="empty">加载失败：${escapeHtml(e.message)}</div>`;
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
  load(true);
}

function initFilters() {
  // 分类下拉
  const sel = $("#categorySelect");
  CATEGORIES.forEach(c => {
    const o = document.createElement("option");
    o.value = c; o.textContent = c;
    sel.appendChild(o);
  });

  $("#typeChips").addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    document.querySelectorAll("#typeChips .chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    state.type = chip.dataset.type || "";
    load(true);
  });

  sel.addEventListener("change", () => { state.category = sel.value; load(true); });
  $("#sortSelect").addEventListener("change", e => { state.sort = e.target.value; load(true); });

  const doSearch = () => { state.q = $("#searchInput").value.trim(); load(true); };
  $("#searchBtn").addEventListener("click", doSearch);
  $("#searchInput").addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });

  $("#moreBtn").addEventListener("click", () => {
    state.offset += state.limit;
    $("#moreBtn").disabled = true;
    $("#moreBtn").textContent = "加载中…";
    load(false);
  });

  $("#mineBtn").addEventListener("click", () =>
    setMode(state.mode === "mine" ? "all" : "mine"));
  $("#favBtn").addEventListener("click", () =>
    setMode(state.mode === "fav" ? "all" : "fav"));

  // 卡片跳转详情
  $("#list").addEventListener("click", e => {
    const card = e.target.closest(".card");
    if (card) location.href = `/item.html?id=${card.dataset.id}`;
  });
}

initFilters();
load(true);
