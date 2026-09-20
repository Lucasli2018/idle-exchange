// 账号页逻辑：注册（绑定当前 clientId）/ 登录（切换到账号 clientId）
const api = new ApiClient();
const $ = sel => document.querySelector(sel);

let mode = "register"; // register | login

function setMode(m) {
  mode = m;
  $("#tabRegister").classList.toggle("active", m === "register");
  $("#tabLogin").classList.toggle("active", m === "login");
  $("#communityField").style.display = m === "register" ? "block" : "none";
  $("#submitBtn").textContent = m === "register" ? "注册" : "登录";
  $("#modeHint").textContent = m === "register"
    ? "注册会把当前设备的身份绑定到昵称，以后任何设备用昵称+口令即可找回物品、收藏和会话。"
    : "登录后自动切换到该账号的身份，本设备上此前的匿名发布不会合并。";
}

$("#tabLogin").addEventListener("click", () => setMode("login"));
$("#tabRegister").addEventListener("click", () => setMode("register"));

$("#authForm").addEventListener("submit", async e => {
  e.preventDefault();
  const nickname = $("#nickname").value.trim();
  const password = $("#password").value;
  if (!nickname) return showToast("请填写昵称", "error");
  if (password.length < 6) return showToast("口令至少 6 位", "error");

  const btn = $("#submitBtn");
  btn.disabled = true;
  btn.textContent = "提交中…";
  try {
    if (mode === "register") {
      await api.post("/api/auth/register", {
        clientId: getClientId(),
        nickname,
        password,
        community: $("#community").value.trim(),
      });
      setProfile({ nickname, community: $("#community").value.trim() || getProfile().community, accounted: true });
      showToast("注册成功！", "success");
    } else {
      const res = await api.post("/api/auth/login", { nickname, password });
      // 切换到账号身份
      localStorage.setItem("idle_client_id", res.clientId);
      const p = getProfile();
      setProfile({ ...p, nickname: res.nickname, accounted: true });
      showToast("登录成功，欢迎回来 " + res.nickname, "success");
    }
    setTimeout(() => { location.href = "/index.html"; }, 800);
  } catch (err) {
    showToast(err.message, "error");
    btn.disabled = false;
    btn.textContent = mode === "register" ? "注册" : "登录";
  }
});

// ============ 邮箱登录（Cloudflare Access OTP）============
const clientId = getClientId();
const emailBtn = $("#emailBtn");
const emailStatus = $("#emailStatus");

emailBtn.addEventListener("click", () => {
  location.href = "/api/access-login"; // Access 拦截 → OTP → 回跳 ?access=1
});

// 从 Access 回跳后：检查邮箱会话状态
(async function checkAccessReturn() {
  if (!new URL(location.href).searchParams.get("access")) return;
  emailStatus.textContent = "正在检查邮箱登录状态…";
  try {
    const me = await api.get("/api/auth/me?clientId=" + encodeURIComponent(clientId));
    if (!me.email) {
      emailStatus.textContent = "未获取到邮箱会话，请重新点击「使用邮箱登录」。";
      return;
    }
    emailStatus.innerHTML = `邮箱：<b>${escapeHtml(me.email)}</b><br>`;

    if (me.boundSelf) {
      emailStatus.innerHTML += "✅ 已绑定当前设备身份，可直接使用。";
    } else if (me.boundClientId) {
      emailStatus.innerHTML += `该邮箱已绑定其它设备账号。点击下方按钮切换到该账号（本设备此前的匿名发布不会合并）。`;
      const b = document.createElement("button");
      b.className = "btn btn-primary btn-block";
      b.style.marginTop = "8px";
      b.textContent = "切换到该账号身份";
      b.addEventListener("click", () => {
        localStorage.setItem("idle_client_id", me.boundClientId);
        const p = getProfile();
        setProfile({ ...p, accounted: true });
        showToast("已切换身份", "success");
        setTimeout(() => { location.href = "/index.html"; }, 700);
      });
      emailStatus.appendChild(b);
    } else {
      emailStatus.innerHTML += "将把该邮箱绑定到当前设备身份（用于以后免口令找回）。";
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
