// 管理后台逻辑：口令 → 概览（统计 + 举报处理：下架/恢复）
const $ = sel => document.querySelector(sel);
const KEY_STORAGE = "idle_admin_key";

function getKey() { return localStorage.getItem(KEY_STORAGE) || ""; }
function setKey(k) { localStorage.setItem(KEY_STORAGE, k); }

async function adminGet(path) {
  return fetch(path, { headers: { "x-admin-key": getKey() } })
    .then(async r => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || r.status);
      return d;
    });
}

async function adminPost(path, body) {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-key": getKey() },
    body: JSON.stringify(body),
  }).then(async r => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || r.status);
    return d;
  });
}

function showDash() {
  $("#loginBox").style.display = "none";
  $("#dashBox").style.display = "block";
  loadOverview();
}

$("#loginBtn").addEventListener("click", async () => {
  const k = $("#adminKey").value.trim();
  if (!k) return showToast("请输入管理口令", "error");
  setKey(k);
  try {
    await adminGet("/api/admin/overview");
    showDash();
  } catch (e) {
    showToast(e.message, "error");
  }
});

$("#refreshBtn").addEventListener("click", loadOverview);
$("#logoutBtn").addEventListener("click", () => {
  setKey("");
  $("#dashBox").style.display = "none";
  $("#loginBox").style.display = "block";
});

async function loadOverview() {
  try {
    const { stats, reports } = await adminGet("/api/admin/overview");
    $("#statsRow").innerHTML = [
      ["在售", stats.itemsAvailable], ["已出", stats.itemsSold],
      ["已下架", stats.itemsRemoved], ["用户", stats.users],
      ["会话", stats.threads], ["举报", stats.reports],
    ].map(([k, v]) => `<div class="stat-card"><div class="stat-v">${v}</div><div class="stat-k">${k}</div></div>`).join("");

    if (!reports.length) {
      $("#reportList").innerHTML = `<div class="empty">暂无举报</div>`;
      return;
    }
    $("#reportList").innerHTML = reports.map(r => `
      <div class="report-card">
        <div class="report-main">
          <div class="report-title">#${r.itemId} ${escapeHtml(r.itemTitle)} <span class="badge ${r.itemStatus === "removed" ? "badge-sold" : "badge-sell"}">${r.itemStatus === "removed" ? "已下架" : "在架"}</span></div>
          <div class="report-reason">${escapeHtml(r.reason)}</div>
          <div class="report-time">${escapeHtml(formatTime(r.createdAt))}</div>
        </div>
        <button class="btn ${r.itemStatus === "removed" ? "" : "btn-primary"}" data-id="${r.itemId}" data-st="${r.itemStatus}">
          ${r.itemStatus === "removed" ? "恢复" : "下架"}
        </button>
      </div>`).join("");

    $("#reportList").querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", async () => {
        const action = btn.dataset.st === "removed" ? "restore" : "remove";
        try {
          await adminPost(`/api/admin/items/${btn.dataset.id}`, { action });
          showToast(action === "remove" ? "已下架" : "已恢复", "success");
          loadOverview();
        } catch (e) {
          showToast("操作失败：" + e.message, "error");
        }
      });
    });
  } catch (e) {
    if (String(e.message).includes("401")) {
      showToast("口令已失效，请重新登录", "error");
      setKey("");
      $("#dashBox").style.display = "none";
      $("#loginBox").style.display = "block";
    } else {
      showToast(e.message, "error");
    }
  }
}

// 自动进入（已存口令）
if (getKey()) showDash();
