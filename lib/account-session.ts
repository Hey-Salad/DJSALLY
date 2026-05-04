import { cookies } from "next/headers"
import {
  createAccountSession,
  signSession,
  verifySession,
  type AccountSession,
  type DjSallyUserAccount,
} from "@/packages/dj-sally-vercel-control/src"

const COOKIE_NAME = "dj_sally_account"

export async function getAccountSession(): Promise<AccountSession | null> {
  const cookieStore = await cookies()
  return verifySession(cookieStore.get(COOKIE_NAME)?.value, getSessionSecret())
}

export async function requireAccountSession(): Promise<AccountSession> {
  const session = await getAccountSession()
  if (!session) {
    throw new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }
  return session
}

export async function setAccountSession(account: DjSallyUserAccount) {
  const cookieStore = await cookies()
  const session = createAccountSession(account)
  cookieStore.set(COOKIE_NAME, signSession(session, getSessionSecret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(session.expiresAt),
  })
  return session
}

export async function clearAccountSession() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

export function getSessionSecretWarning() {
  return process.env.DJ_SALLY_SESSION_SECRET
    ? null
    : "DJ_SALLY_SESSION_SECRET is not set; using a development fallback secret."
}

function getSessionSecret() {
  return process.env.DJ_SALLY_SESSION_SECRET || "dj-sally-development-session-secret"
}
