// 列表页逻辑：分类/类型/搜索/我的发布 筛选 + 分页加载
const api = new ApiClient();

const state = {
  type: "", category: "", q: "", sort: "newest",
  owner: false, offset: 0, limit: 30, total: 0, loading: false,
};

const $ = sel => document.querySelector(sel);

function buildQuery() {
  const p = new URLSearchParams();
  if (state.type) p.set("type", state.type);
  if (state.category) p.set("category", state.category);
  if (state.q) p.set("q", state.q);
  if (state.sort) p.set("sort", state.sort);
  if (state.owner) p.set("owner", getClientId());
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

function renderMore(hasMore) {
  const wrap = $("#moreWrap");
  wrap.style.display = hasMore ? "block" : "none";
  $("#moreBtn").disabled = false;
  $("#moreBtn").textContent = "加载更多";
}

async function load(reset) {
  if (state.loading) return;
  if (reset) { state.offset = 0; $("#list").innerHTML = ""; }
  state.loading = true;
  try {
    const data = await api.get("/api/items?" + buildQuery());
    state.total = data.total || 0;
    const items = data.items || [];
    if (reset && items.length === 0) {
      $("#list").innerHTML = `<div class="empty"><div class="big">📭</div>这里还没有物品<br>点右上角「发布」第一个吧</div>`;
    } else {
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

  $("#mineBtn").addEventListener("click", () => {
    state.owner = !state.owner;
    $("#mineBtn").classList.toggle("active", state.owner);
    $("#mineBtn").textContent = state.owner ? "全部" : "我的发布";
    load(true);
  });

  // 卡片跳转详情
  $("#list").addEventListener("click", e => {
    const card = e.target.closest(".card");
    if (card) location.href = `/item.html?id=${card.dataset.id}`;
  });
}

initFilters();
load(true);
