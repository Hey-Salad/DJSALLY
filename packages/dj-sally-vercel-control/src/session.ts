import { createHmac, timingSafeEqual } from "node:crypto"
import type { AccountSession, DjSallyUserAccount } from "./types"

const SESSION_VERSION = "v1"

export function createAccountSession(account: DjSallyUserAccount, ttlMs = 30 * 24 * 60 * 60 * 1000): AccountSession {
  return {
    account,
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
  }
}

export function signSession(session: AccountSession, secret: string): string {
  const payload = base64UrlEncode(JSON.stringify({ version: SESSION_VERSION, session }))
  return `${payload}.${sign(payload, secret)}`
}

export function verifySession(value: string | undefined, secret: string): AccountSession | null {
  if (!value) return null

  const [payload, signature] = value.split(".")
  if (!payload || !signature || !safeEqual(signature, sign(payload, secret))) return null

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as { version?: string; session?: AccountSession }
    if (parsed.version !== SESSION_VERSION || !parsed.session?.account) return null
    if (Date.parse(parsed.session.expiresAt) <= Date.now()) return null
    return parsed.session
  } catch {
    return null
  }
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url")
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url")
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8")
}
