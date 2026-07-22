import { getChatGPTUser } from "./chatgpt-auth";

const ADMIN_EMAIL = "eomkun12@gmail.com";

export async function isSiteAdmin() {
  const user = await getChatGPTUser();
  return user?.email.toLowerCase() === ADMIN_EMAIL;
}

export async function requireSiteAdminResponse() {
  return (await isSiteAdmin())
    ? null
    : Response.json({ error: "관리자 계정으로 로그인해야 사용할 수 있습니다." }, { status: 403 });
}
