import { NextResponse } from "next/server"
import { requireAccountSession, setAccountSession } from "@/lib/account-session"
import { updateUserSetup, type UserSetup } from "@/packages/dj-sally-vercel-control/src"

export const runtime = "nodejs"

export async function PATCH(request: Request) {
  try {
    const session = await requireAccountSession()
    const patch = await request.json().catch(() => ({})) as Partial<UserSetup>
    const account = updateUserSetup(session.account, patch)
    const nextSession = await setAccountSession(account)

    return NextResponse.json({
      authenticated: true,
      account: nextSession.account,
      expiresAt: nextSession.expiresAt,
    })
  } catch (error) {
    if (error instanceof Response) return error
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update setup" }, { status: 500 })
  }
}
