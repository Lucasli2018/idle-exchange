// GET /api/files/:key
// 从 R2 读取图片并以 image 响应返回（公开访问，供列表/详情页展示）
// key 为扁平文件名（不含路径），做字符白名单防止目录穿越

import { fail } from "../../_shared/helpers.js";

export async function onRequestGet({ env, params }) {
  const key = params.key;
  if (!key || !/^[A-Za-z0-9._-]{1,200}$/.test(key)) {
    return fail("非法 key", 400);
  }

  const obj = await env.R2.get(key);
  if (!obj) return fail("图片不存在", 404);

  const contentType = obj.httpMetadata?.contentType || "image/jpeg";
  return new Response(obj.body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-length": String(obj.size),
      "cache-control": "public, max-age=86400",
      "access-control-allow-origin": "*",
    },
  });
}
