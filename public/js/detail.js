// 详情页逻辑：展示物品 + 联系发布者 + 发布者管理（标记已出/删除）
const api = new ApiClient();
const id = new URL(location.href).searchParams.get("id");
const clientId = getClientId();
const $ = sel => document.querySelector(sel);

if (!id) {
  $("#detail").innerHTML = `<div class="empty">缺少物品 id</div>`;
} else {
  load();
}

async function load() {
  try {
    const item = await api.get("/api/items/" + encodeURIComponent(id));
    render(item);
  } catch (e) {
    $("#detail").innerHTML = `<div class="empty">加载失败：${escapeHtml(e.message)}</div>`;
  }
}

function galleryHtml(item) {
  if (!item.images || item.images.length === 0) {
    return `<div class="gallery"><div class="ph">📦 暂无图片</div></div>`;
  }
  return `<div class="gallery">` + item.images.map(u =>
    `<img src="${escapeHtml(u)}" onerror="this.style.display='none'">`
  ).join("") + `</div>`;
}

function render(item) {
  const isOwner = item.ownerId === clientId;
  const sold = item.status === "sold";

  const contact = `
    <div class="contact-box">
      <div class="ttl">联系方式</div>
      <div class="line"><span>昵称</span><span>${escapeHtml(item.contactName || "—")}</span></div>
      ${item.contactWechat ? `<div class="line"><span>微信</span><span class="copy" data-copy="${escapeHtml(item.contactWechat)}">${escapeHtml(item.contactWechat)} · 复制</span></div>` : ""}
      ${item.contactPhone ? `<div class="line"><span>手机</span><span class="copy" data-copy="${escapeHtml(item.contactPhone)}">${escapeHtml(item.contactPhone)} · 复制</span></div>` : ""}
    </div>`;

  const ownerActions = isOwner ? `
    <div style="padding:0 16px 20px;display:flex;gap:10px;">
      <button class="btn ${sold ? "" : "btn-primary"}" id="toggleSold">${sold ? "重新上架" : "标记已出"}</button>
      <button class="btn" id="deleteBtn" style="color:#e74c3c;">删除</button>
    </div>` : "";

  $("#detail").innerHTML = `
    ${galleryHtml(item)}
    <div class="info">
      ${sold ? `<span class="badge badge-sold">已出</span>` : ""}
      <h2>${escapeHtml(item.title)}</h2>
      <div class="price">${escapeHtml(formatPrice(item))}</div>
      <div class="kv">
        <span class="tag">${escapeHtml(TYPE_LABELS[item.type] || "")}</span>
        <span class="tag">${escapeHtml(item.category)}</span>
        ${item.community ? `<span class="tag">${escapeHtml(item.community)}</span>` : ""}
        <span class="tag">${escapeHtml(formatTime(item.createdAt))}</span>
      </div>
      ${item.description ? `<div class="desc">${escapeHtml(item.description)}</div>` : ""}
    </div>
    ${contact}
    ${ownerActions}
  `;

  // 复制联系方式
  document.querySelectorAll(".copy").forEach(el => {
    el.addEventListener("click", () => copyText(el.dataset.copy));
  });

  if (isOwner) {
    $("#toggleSold").addEventListener("click", () => toggleSold(item, sold));
    $("#deleteBtn").addEventListener("click", () => removeItem(item));
  }
}

async function toggleSold(item, sold) {
  try {
    await api.patch("/api/items/" + item.id, {
      clientId,
      status: sold ? "available" : "sold",
    });
    showToast(sold ? "已重新上架" : "已标记已出", "success");
    load();
  } catch (e) {
    showToast("操作失败：" + e.message, "error");
  }
}

async function removeItem(item) {
  if (!confirm("确定删除该物品？删除后不可恢复。")) return;
  try {
    await api.del("/api/items/" + item.id + "?clientId=" + encodeURIComponent(clientId));
    showToast("已删除", "success");
    setTimeout(() => { location.href = "/index.html"; }, 600);
  } catch (e) {
    showToast("删除失败：" + e.message, "error");
  }
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => showToast("已复制：" + text, "success"),
      () => showToast("复制失败，请手动复制", "error")
    );
  } else {
    showToast("请长按手动复制：" + text, "info");
  }
}
