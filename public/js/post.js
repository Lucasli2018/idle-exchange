// 发布表单逻辑：多图上传预览 + 提交
const api = new ApiClient();
const uploaded = []; // { key, url }

const $ = sel => document.querySelector(sel);

// 分类下拉 + 预填档案
(function init() {
  const sel = $("#category");
  CATEGORIES.forEach(c => {
    const o = document.createElement("option");
    o.value = c; o.textContent = c;
    sel.appendChild(o);
  });
  const p = getProfile();
  if (p.nickname) $("#contactName").value = p.nickname;
  if (p.community) $("#community").value = p.community;
})();

// 类型切换：仅「出售」显示价格
$("#typeGroup").addEventListener("change", () => {
  const type = document.querySelector('input[name=type]:checked').value;
  $("#priceField").style.display = type === "sell" ? "block" : "none";
});
$("#priceField").style.display = "block";

// ===== 图片上传 =====
const fileInput = $("#fileInput");
$("#addSlot").addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const files = Array.from(fileInput.files || []);
  fileInput.value = "";
  for (const file of files) {
    if (uploaded.length >= 9) { showToast("最多 9 张图片", "error"); break; }
    const slot = addUploadingSlot();
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post("/api/upload", form);
      uploaded.push({ key: res.key, url: res.url });
      replaceSlotWithImage(slot, res.url);
    } catch (e) {
      slot.remove();
      showToast("图片上传失败：" + e.message, "error");
    }
  }
  renderAddSlot();
});

function addUploadingSlot() {
  const slot = document.createElement("div");
  slot.className = "slot";
  slot.textContent = "…";
  $("#uploader").insertBefore(slot, $("#addSlot"));
  return slot;
}

function replaceSlotWithImage(slot, url) {
  slot.innerHTML = `<img src="${escapeHtml(url)}"><span class="del">×</span>`;
  slot.querySelector(".del").addEventListener("click", () => {
    const idx = uploaded.findIndex(u => u.url === url);
    if (idx >= 0) uploaded.splice(idx, 1);
    slot.remove();
    renderAddSlot();
  });
}

function renderAddSlot() {
  $("#addSlot").style.display = uploaded.length >= 9 ? "none" : "flex";
}

// ===== 提交 =====
$("#postForm").addEventListener("submit", async e => {
  e.preventDefault();
  const type = document.querySelector('input[name=type]:checked').value;
  const title = $("#title").value.trim();
  const category = $("#category").value;
  const price = $("#price").value;
  const description = $("#description").value.trim();
  const community = $("#community").value.trim();
  const contactName = $("#contactName").value.trim();
  const contactWechat = $("#contactWechat").value.trim();
  const contactPhone = $("#contactPhone").value.trim();

  if (!title) return showToast("请填写标题", "error");
  if (!category) return showToast("请选择分类", "error");
  if (type === "sell") {
    if (price === "" || Number(price) < 0) return showToast("请填写有效价格", "error");
  }
  if (!contactName) return showToast("请填写联系人昵称", "error");
  if (!contactWechat && !contactPhone) return showToast("至少留一个联系方式（微信或手机）", "error");

  const btn = $("#submitBtn");
  btn.disabled = true;
  btn.textContent = "发布中…";

  const body = {
    clientId: getClientId(),
    nickname: contactName,
    community,
    title,
    description,
    category,
    type,
    price: type === "sell" ? Number(price) : null,
    contactName,
    contactWechat,
    contactPhone,
    images: uploaded.map(u => u.key),
  };

  try {
    const res = await api.post("/api/items", body);
    // 保存档案，方便下次预填与「我的发布」
    setProfile({ nickname: contactName, community });
    showToast("发布成功！", "success");
    setTimeout(() => { location.href = `/item.html?id=${res.id}`; }, 700);
  } catch (err) {
    showToast("发布失败：" + err.message, "error");
    btn.disabled = false;
    btn.textContent = "发布";
  }
});
