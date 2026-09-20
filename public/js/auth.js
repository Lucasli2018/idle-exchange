// 账号页逻辑：账号 + 密码 的登录 / 注册
const api = new ApiClient();
const $ = sel => document.querySelector(sel);

let mode = "login"; // login | register

// ============ 标签切换（带滑动指示条 + 面板动画）============
function moveIndicator() {
  const active = mode === "login" ? $("#tabLogin") : $("#tabRegister");
  const ind = $("#tabInd");
  ind.style.width = active.offsetWidth + "px";
  ind.style.transform = "translateX(" + (active.offsetLeft - 4) + "px)";
}

function setMode(m) {
  if (mode === m) return;
  mode = m;
  $("#tabLogin").classList.toggle("active", m === "login");
  $("#tabRegister").classList.toggle("active", m === "register");
  moveIndicator();
  const login = m === "login";
  $("#panelLogin").hidden = !login;
  $("#panelRegister").hidden = login;
  const panel = login ? $("#panelLogin") : $("#panelRegister");
  panel.classList.remove("in"); void panel.offsetWidth; panel.classList.add("in");
  clearErrors();
}

$("#tabLogin").addEventListener("click", () => setMode("login"));
$("#tabRegister").addEventListener("click", () => setMode("register"));
// 进入页面后按布局定位指示条
requestAnimationFrame(moveIndicator);
window.addEventListener("resize", moveIndicator);

// ============ 行内校验工具 ============
function setErr(fieldId, errId, msg) {
  const f = $("#" + fieldId);
  if (msg) { f.classList.add("error"); $("#" + errId).textContent = msg; }
  else { f.classList.remove("error"); $("#" + errId).textContent = ""; }
}
function clearErrors() {
  ["fAccountL", "fPassL", "fAccountR", "fPassR", "fConfirmR"].forEach(f => {
    $("#" + f).classList.remove("error");
  });
  ["errAccountL", "errPassL", "errAccountR", "errPassR", "errConfirmR"].forEach(e => {
    $("#" + e).textContent = "";
  });
}

// ============ 密码可见切换 ============
document.querySelectorAll(".pw-toggle").forEach(btn => {
  btn.addEventListener("click", () => {
    const input = $("#" + btn.dataset.target);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.textContent = show ? "🙈" : "👁";
    btn.blur();
  });
});

// ============ 密码强度条 ============
function scorePassword(pw) {
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 10) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^a-zA-Z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}
function renderStrength() {
  const pw = $("#regPassword").value;
  const el = $("#pwStrength");
  const score = pw ? scorePassword(pw) : 0;
  el.className = "pw-strength" + (score ? " s" + score : "");
}

// ============ 账号可用性（注册时失焦检查）============
let accountCheckTimer = null;
let lastCheckedAccount = "";
$("#regAccount").addEventListener("input", () => {
  setErr("fAccountR", "errAccountR", "");
  renderStrength();
  clearTimeout(accountCheckTimer);
  const v = $("#regAccount").value.trim();
  if (v.length < 2) { lastCheckedAccount = ""; return; }
  accountCheckTimer = setTimeout(async () => {
    if ($("#regAccount").value.trim() !== v) return;
    lastCheckedAccount = v;
    try {
      const r = await api.get("/api/auth/available?nickname=" + encodeURIComponent(v));
      if (!r.available) setErr("fAccountR", "errAccountR", "该账号已被占用，换一个吧");
    } catch {}
  }, 400);
});
$("#regPassword").addEventListener("input", renderStrength);

// ============ 提交 ============
function setLoading(btn, loading) {
  const sp = btn.querySelector(".spinner");
  const lbl = btn.querySelector(".btn-label");
  btn.disabled = loading;
  sp.hidden = !loading;
  lbl.textContent = loading ? (mode === "login" ? "登录中…" : "注册中…") : (mode === "login" ? "登录" : "注册并登录");
}

$("#authForm").addEventListener("submit", async e => {
  e.preventDefault();
  clearErrors();

  if (mode === "login") {
    const account = $("#loginAccount").value.trim();
    const password = $("#loginPassword").value;
    if (!account) return setErr("fAccountL", "errAccountL", "请输入账号");
    if (!password) return setErr("fPassL", "errPassL", "请输入密码");

    const btn = $("#loginSubmit");
    setLoading(btn, true);
    try {
      const res = await api.post("/api/auth/login", { nickname: account, password });
      localStorage.setItem("idle_client_id", res.clientId);
      const p = getProfile();
      setProfile({ ...p, nickname: res.nickname, accounted: true });
      showToast("登录成功，欢迎回来 " + res.nickname, "success");
      setTimeout(() => { location.href = "/index.html"; }, 700);
    } catch (err) {
      setLoading(btn, false);
      setErr("fPassL", "errPassL", err.message);
    }
    return;
  }

  // ---- 注册 ----
  const account = $("#regAccount").value.trim();
  const password = $("#regPassword").value;
  const confirm = $("#regConfirm").value;
  if (account.length < 2) return setErr("fAccountR", "errAccountR", "账号至少 2 字");
  if (account.length > 20) return setErr("fAccountR", "errAccountR", "账号最多 20 字");
  if (password.length < 6) return setErr("fPassR", "errPassR", "密码至少 6 位");
  if (password !== confirm) return setErr("fConfirmR", "errConfirmR", "两次输入的密码不一致");
  if (lastCheckedAccount === account && $("#errAccountR").textContent) {
    return; // 已被占用
  }

  const btn = $("#regSubmit");
  setLoading(btn, true);
  try {
    await api.post("/api/auth/register", {
      clientId: getClientId(),
      nickname: account,
      password,
      community: $("#regCommunity").value.trim(),
    });
    setProfile({ nickname: account, community: $("#regCommunity").value.trim() || getProfile().community, accounted: true });
    showToast("注册成功，已自动登录！", "success");
    setTimeout(() => { location.href = "/index.html"; }, 700);
  } catch (err) {
    setLoading(btn, false);
    if (/占用/.test(err.message)) setErr("fAccountR", "errAccountR", err.message);
    else setErr("fPassR", "errPassR", err.message);
  }
});

// ============ 邮箱验证码登录（Cloudflare Access OTP，次要入口）============
$("#emailBtn").addEventListener("click", () => {
  location.href = "/api/access-login"; // Access 拦截 → OTP → 回跳 ?access=1
});

(async function checkAccessReturn() {
  if (!new URL(location.href).searchParams.get("access")) return;
  const emailStatus = $("#emailStatus");
  emailStatus.textContent = "正在检查邮箱登录状态…";
  try {
    const clientId = getClientId();
    const me = await api.get("/api/auth/me?clientId=" + encodeURIComponent(clientId));
    if (!me.email) {
      emailStatus.textContent = "未获取到邮箱会话，请重新点击「使用邮箱验证码登录」。";
      return;
    }
    emailStatus.innerHTML = `邮箱：<b>${escapeHtml(me.email)}</b><br>`;

    if (me.boundSelf) {
      emailStatus.innerHTML += "✅ 已绑定当前设备身份，可直接使用。";
    } else if (me.boundClientId) {
      emailStatus.innerHTML += "该邮箱已绑定其它账号。点击下方按钮切换到该账号。";
      const b = document.createElement("button");
      b.className = "btn btn-primary btn-block";
      b.style.marginTop = "8px";
      b.textContent = "切换到该账号";
      b.addEventListener("click", () => {
        localStorage.setItem("idle_client_id", me.boundClientId);
        const p = getProfile();
        setProfile({ ...p, accounted: true });
        showToast("已切换身份", "success");
        setTimeout(() => { location.href = "/index.html"; }, 700);
      });
      emailStatus.appendChild(b);
    } else {
      emailStatus.innerHTML += "将把该邮箱绑定到当前设备身份（用于以后免密码登录）。";
      const b = document.createElement("button");
      b.className = "btn btn-primary btn-block";
      b.style.marginTop = "8px";
      b.textContent = "绑定邮箱到当前设备";
      b.addEventListener("click", async () => {
        try {
          await api.post("/api/auth/bind-email", { clientId });
          setProfile({ ...getProfile(), accounted: true });
          showToast("邮箱绑定成功！", "success");
          setTimeout(() => { location.href = "/index.html"; }, 700);
        } catch (e) {
          showToast(e.message, "error");
        }
      });
      emailStatus.appendChild(b);
    }
  } catch (e) {
    emailStatus.textContent = "检查失败：" + e.message;
  }
})();
