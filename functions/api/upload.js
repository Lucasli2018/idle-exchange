// POST /api/upload
// 上传物品图片到 R2，返回 key 与可访问 URL（公开访问，无需鉴权）
//
// Body: multipart/form-data
//   - file: 图片文件（≤ 5 MB，仅 jpg/png/webp）
//
// 返回：{ key, url: "/api/files/<key>", size, type }

import { json, fail } from "../_shared/helpers.js";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

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
