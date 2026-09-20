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
    const item = await api.get("/api/items/" + encodeURIComponent(id) +
      "?clientId=" + encodeURIComponent(clientId));
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
      <div class="line"><span>昵称</span><a href="/user.html?uid=${encodeURIComponent(item.ownerId)}" style="color:var(--coral-dark);font-weight:600;">${escapeHtml(item.contactName || "—")} · 主页</a></div>
      ${item.contactWechat ? `<div class="line"><span>微信</span><span class="copy" data-copy="${escapeHtml(item.contactWechat)}">${escapeHtml(item.contactWechat)} · 复制</span></div>` : ""}
      ${item.contactPhone ? `<div class="line"><span>手机</span><span class="copy" data-copy="${escapeHtml(item.contactPhone)}">${escapeHtml(item.contactPhone)} · 复制</span></div>` : ""}
    </div>`;

  const ownerActions = isOwner ? `
      <button class="btn ${sold ? "" : "btn-primary"}" id="toggleSold">${sold ? "重新上架" : "标记已出"}</button>
      <button class="btn" id="deleteBtn" style="color:#e74c3c;">删除</button>
  ` : "";

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
        <span class="tag">浏览 ${Number(item.views) || 0} 次</span>
      </div>
      ${item.description ? `<div class="desc">${escapeHtml(item.description)}</div>` : ""}
    </div>
    ${contact}
    <div class="action-bar">
      <button class="btn ${item.favorited ? "btn-faved" : ""}" id="favBtn">
        ${item.favorited ? "★ 已收藏" : "☆ 收藏"}
      </button>
      ${isOwner ? "" : `<button class="btn" id="msgBtn">私信发布者</button>`}
      ${ownerActions}
    </div>
    <div class="report-row"><a id="reportLink">举报该物品</a></div>
  `;

  // 复制联系方式
  document.querySelectorAll(".copy").forEach(el => {
    el.addEventListener("click", () => copyText(el.dataset.copy));
  });

  $("#favBtn").addEventListener("click", () => toggleFavorite(item));
  $("#reportLink").addEventListener("click", () => reportItem(item));

  const msgBtn = $("#msgBtn");
  if (msgBtn) msgBtn.addEventListener("click", () => sendFirstMessage(item));

  if (isOwner) {
    $("#toggleSold").addEventListener("click", () => toggleSold(item, sold));
    $("#deleteBtn").addEventListener("click", () => removeItem(item));
  }
}

async function toggleFavorite(item) {
  const btn = $("#favBtn");
  btn.disabled = true;
  try {
    if (item.favorited) {
      await api.del("/api/items/" + item.id + "/favorite?clientId=" + encodeURIComponent(clientId));
      item.favorited = false;
      btn.classList.remove("btn-faved");
      btn.textContent = "☆ 收藏";
      showToast("已取消收藏", "success");
    } else {
      await api.post("/api/items/" + item.id + "/favorite", { clientId });
      item.favorited = true;
      btn.classList.add("btn-faved");
      btn.textContent = "★ 已收藏";
      showToast("已收藏，可在首页「收藏」中查看", "success");
    }
  } catch (e) {
    showToast("操作失败：" + e.message, "error");
  } finally {
    btn.disabled = false;
  }
}

async function sendFirstMessage(item) {
  const text = prompt(`给「${item.contactName || "发布者"}」发私信：`);
  if (text === null) return;
  if (!text.trim()) return showToast("消息不能为空", "error");
  try {
    await api.post("/api/items/" + item.id + "/message", { clientId, body: text.trim() });
    if (confirm("私信已发送！对方回复后可在「消息」页查看。现在打开消息页吗？")) {
      location.href = "/messages.html";
    }
  } catch (e) {
    showToast("发送失败：" + e.message, "error");
  }
}

async function reportItem(item) {
  const reason = prompt("请填写举报原因（如：虚假信息 / 违禁品 / 已售未标记）：");
  if (reason === null) return;
  if (!reason.trim()) return showToast("请填写举报原因", "error");
  try {
    await api.post("/api/items/" + item.id + "/report", { clientId, reason: reason.trim() });
    showToast("举报已提交，感谢反馈", "success");
  } catch (e) {
    showToast("举报失败：" + e.message, "error");
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
