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
