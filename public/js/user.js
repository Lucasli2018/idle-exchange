// 用户主页：昵称 + TA 的在售/已出物品
const api = new ApiClient();
const uid = new URL(location.href).searchParams.get("uid");
const $ = sel => document.querySelector(sel);

if (!uid) {
  $("#userHero").innerHTML = `<div class="empty">缺少用户参数</div>`;
} else {
  load();
}

async function load() {
  try {
    const data = await api.get("/api/items?owner=" + encodeURIComponent(uid) + "&limit=60");
    const items = data.items || [];
    const name = items[0] ? (items[0].contactName || "用户") : "用户";
    const onSale = items.filter(i => i.status === "available").length;
    $("#userHero").innerHTML = `
      <div class="user-card">
        <div class="avatar big">${escapeHtml(name.slice(0, 1))}</div>
        <div>
          <div class="user-name">${escapeHtml(name)}</div>
          <div class="user-sub">在售 ${onSale} 件 · 共 ${items.length} 件</div>
        </div>
      </div>`;
    $("#list").innerHTML = items.length
      ? items.map(cardHtml).join("")
      : `<div class="empty"><div class="big">📭</div>TA 还没有发布物品</div>`;
    $("#list").addEventListener("click", e => {
      const card = e.target.closest(".card");
      if (card) location.href = `/item.html?id=${card.dataset.id}`;
    });
  } catch (e) {
    $("#userHero").innerHTML = `<div class="empty">加载失败：${escapeHtml(e.message)}</div>`;
  }
}
