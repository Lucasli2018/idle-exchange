// items 领域共享：图片 URL 拼接 + 行 → API 对象
// 注意各目录引用深度：
//   functions/api/*.js            → ../_shared/items.js
//   functions/api/items/*.js      → ../../_shared/items.js
//   functions/api/items/[id]/*.js → ../../../_shared/items.js

// 图片展示 URL：配置了 R2_PUBLIC_BASE（自定义公开域/r2.dev）时直连 R2，
// 否则回退 /api/files/<key> Function 代理
//
// 例外：已经是完整地址的项（http(s):// 外链、data: 内联、/ 开头的站内路径）
// 原样透传，不再拼接。测试数据/外部图源无需占用 R2 即可展示。
export function isDirectImageUrl(v) {
  return /^(https?:\/\/|data:|\/)/i.test(String(v || ""));
}

export function imageUrls(env, keys) {
  const base = env && env.R2_PUBLIC_BASE
    ? String(env.R2_PUBLIC_BASE).replace(/\/+$/, "")
    : "";
  return keys.map(k => {
    if (isDirectImageUrl(k)) return String(k);
    return base ? `${base}/${encodeURIComponent(k)}` : `/api/files/${encodeURIComponent(k)}`;
  });
}

export function rowToItem(r, env) {
  let images = [];
  try { images = JSON.parse(r.images || "[]"); } catch {}
  images = imageUrls(env, images); // 存储层是 R2 key，展示层统一拼 URL
  return {
    id: r.id,
    ownerId: r.owner_id,
    title: r.title,
    description: r.description,
    category: r.category,
    type: r.type,
    price: r.price,
    community: r.community,
    contactName: r.contact_name,
    contactWechat: r.contact_wechat,
    contactPhone: r.contact_phone,
    images,
    status: r.status,
    views: r.views || 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
