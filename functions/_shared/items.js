// items 领域共享：行 → API 对象
// 注意各目录引用深度：
//   functions/api/*.js            → ../_shared/items.js
//   functions/api/items/*.js      → ../../_shared/items.js
//   functions/api/items/[id]/*.js → ../../../_shared/items.js

export function rowToItem(r) {
  let images = [];
  try { images = JSON.parse(r.images || "[]"); } catch {}
  // 存储层是 R2 key，展示层统一拼接代理 URL（前端可直接作为 img src）
  images = images.map(k => `/api/files/${encodeURIComponent(k)}`);
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
