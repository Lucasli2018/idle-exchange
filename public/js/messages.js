// 消息页逻辑：会话列表 / 聊天视图（15s 轮询）
const api = new ApiClient();
const clientId = getClientId();
const $ = sel => document.querySelector(sel);
const convId = new URL(location.href).searchParams.get("c");
let pollTimer = null;

// 返回按钮：聊天 → 会话列表；列表 → 首页
$("#backBtn").addEventListener("click", () => {
  if (convId) location.href = "/messages.html";
  else location.href = "/index.html";
});

if (convId) openChat(convId);
else loadThreads();

// ============ 会话列表 ============
async function loadThreads() {
  $("#pageTitle").textContent = "消息";
  try {
    const data = await api.get("/api/threads?clientId=" + encodeURIComponent(clientId));
    const list = $("#threadList");
    if (!data.threads.length) {
      list.innerHTML = `<div class="empty"><div class="big">💬</div>还没有会话<br>在感兴趣的物品详情页「私信发布者」吧</div>`;
      return;
    }
    list.innerHTML = data.threads.map(t => `
      <div class="thread-item" data-c="${t.id}">
        <div class="avatar">${escapeHtml((t.otherName || "?").slice(0, 1))}</div>
        <div class="thread-main">
          <div class="thread-top">
            <span class="thread-name">${escapeHtml(t.otherName)}</span>
            <span class="thread-time">${escapeHtml(formatTime(t.lastAt))}</span>
          </div>
          <div class="thread-item-title">关于：${escapeHtml(t.itemTitle)}</div>
          <div class="thread-last">${escapeHtml(t.lastBody)}</div>
        </div>
      </div>`).join("");
    list.querySelectorAll(".thread-item").forEach(el => {
      el.addEventListener("click", () => {
        location.href = "/messages.html?c=" + el.dataset.c;
      });
    });
  } catch (e) {
    $("#threadList").innerHTML = `<div class="empty">加载失败：${escapeHtml(e.message)}</div>`;
  }
}

// ============ 聊天视图 ============
async function openChat(cid) {
  $("#pageTitle").textContent = "聊天";
  $("#threadView").style.display = "none";
  $("#chatView").style.display = "block";
  await refreshChat(cid);
  // 15s 轮询新消息
  pollTimer = setInterval(() => refreshChat(cid, true), 15000);
  window.addEventListener("beforeunload", () => clearInterval(pollTimer));
}

async function refreshChat(cid, silent) {
  try {
    // 会话元信息（对方/物品）从会话列表接口取单条较繁，这里直接并行拉列表找自己
    const [chat, meta] = await Promise.all([
      api.get("/api/threads/" + cid + "?clientId=" + encodeURIComponent(clientId)),
      api.get("/api/threads?clientId=" + encodeURIComponent(clientId)),
    ]);
    const t = meta.threads.find(x => String(x.id) === String(cid));
    if (t) {
      $("#chatHead").innerHTML =
        `<a class="chat-item-link" href="/item.html?id=${t.itemId}">${escapeHtml(t.itemTitle)}</a>` +
        `<span class="chat-with">与 ${escapeHtml(t.otherName)} 对话</span>`;
    }
    renderMsgs(chat.messages);
  } catch (e) {
    if (!silent) $("#msgList").innerHTML = `<div class="empty">加载失败：${escapeHtml(e.message)}</div>`;
  }
}

function renderMsgs(messages) {
  const box = $("#msgList");
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  box.innerHTML = messages.map(m => `
    <div class="msg-row ${m.mine ? "mine" : ""}">
      <div class="bubble">${escapeHtml(m.body)}</div>
    </div>`).join("") || `<div class="empty">暂无消息</div>`;
  if (atBottom) box.scrollTop = box.scrollHeight;
}

async function sendMsg() {
  const input = $("#msgInput");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  try {
    await api.post("/api/threads/" + convId, { clientId, body: text });
    await refreshChat(convId, true);
  } catch (e) {
    showToast("发送失败：" + e.message, "error");
    input.value = text; // 恢复输入
  }
}

$("#sendBtn").addEventListener("click", sendMsg);
$("#msgInput").addEventListener("keydown", e => { if (e.key === "Enter") sendMsg(); });
