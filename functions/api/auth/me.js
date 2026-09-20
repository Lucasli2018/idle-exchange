// GET /api/auth/me   当前邮箱登录状态
// 返回：{ email, boundClientId, boundSelf }
//   email         会话对应邮箱（无会话为 null）
//   boundClientId 该邮箱已绑定的账号（未绑定为 null）
//   boundSelf     已绑定且就是当前设备身份

import { json } from "../../_shared/helpers.js";
import { getSessionEmail } from "../../_shared/access.js";

export async function onRequestGet({ request, env }) {
  const session = await getSessionEmail(request, env);
  if (!session) return json({ email: null, boundClientId: null, boundSelf: false });

  const bound = await env.DB.prepare(
    "SELECT client_id FROM users WHERE email = ?"
  ).bind(session.email).first();

  const clientId = new URL(request.url).searchParams.get("clientId");
  const boundClientId = bound ? bound.client_id : null;

  return json({
    email: session.email,
    boundClientId,
    boundSelf: !!boundClientId && boundClientId === clientId,
  });
}
