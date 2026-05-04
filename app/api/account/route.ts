import { NextResponse } from "next/server"
import { clearAccountSession, getAccountSession, getSessionSecretWarning, setAccountSession } from "@/lib/account-session"
import { createUserAccount } from "@/packages/dj-sally-vercel-control/src"

export const runtime = "nodejs"

export async function GET() {
  const session = await getAccountSession()

  return NextResponse.json({
    authenticated: Boolean(session),
    account: session?.account ?? null,
    expiresAt: session?.expiresAt ?? null,
    warning: getSessionSecretWarning(),
  })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { email?: string; displayName?: string }
  const account = createUserAccount({
    email: body.email,
    displayName: body.displayName,
  })
  const session = await setAccountSession(account)

  return NextResponse.json({
    authenticated: true,
    account: session.account,
    expiresAt: session.expiresAt,
    warning: getSessionSecretWarning(),
  })
}

export async function DELETE() {
  await clearAccountSession()
  return NextResponse.json({ authenticated: false })
}
