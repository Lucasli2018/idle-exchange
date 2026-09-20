// POST /api/upload
// 上传物品图片到 R2，返回 key 与可访问 URL（公开访问，带简单频率限制）
//
// Body: multipart/form-data
//   - file: 图片文件（≤ 5 MB，仅 jpg/png/webp）
//   - clientId: 发布者标识（可选，用于限流）
//
// 返回：{ key, url: "/api/files/<key>", size, type }

import { json, fail } from "../_shared/helpers.js";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// 简单滑动窗口限流（单实例内存，MVP 防滥用足够）
const RATE_LIMIT = 12;        // 每窗口次数
const RATE_WINDOW = 60_000;   // 1 分钟
const rateMap = new Map();

function allowUpload(clientId) {
  const now = Date.now();
  // 防 Map 无限膨胀
  if (rateMap.size > 10_000) rateMap.clear();
  const arr = (rateMap.get(clientId) || []).filter(t => now - t < RATE_WINDOW);
  if (arr.length >= RATE_LIMIT) return false;
  arr.push(now);
  rateMap.set(clientId, arr);
  return true;
}

export async function onRequestPost({ request, env }) {
  const ctype = request.headers.get("content-type") || "";
  if (!ctype.startsWith("multipart/form-data")) {
    return fail("Content-Type 必须是 multipart/form-data", 400);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return fail("表单解析失败", 400);
  }

  const clientId = (form.get("clientId") || "anon").toString().slice(0, 64);
  if (!allowUpload(clientId)) {
    return fail("上传太频繁，请稍后再试", 429);
  }

  const file = form.get("file");
  if (!file || typeof file !== "object" || typeof file.arrayBuffer !== "function") {
    return fail("缺少 file 字段", 400);
  }
  if (file.size > MAX_SIZE) {
    return fail(`文件太大，最大 ${MAX_SIZE / 1024 / 1024} MB`, 400);
  }
  const ext = ALLOWED[file.type];
  if (!ext) {
    return fail(`不支持的格式：${file.type || "未知"}，仅支持 jpg/png/webp`, 400);
  }

  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  const key = `img-${ts}-${rand}.${ext}`;

  try {
    await env.R2.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });
  } catch (err) {
    console.error("R2 upload failed:", err);
    return fail("上传失败：" + err.message, 500);
  }

  return json({
    key,
    url: `/api/files/${key}`,
    size: file.size,
    type: file.type,
  }, 201);
}
