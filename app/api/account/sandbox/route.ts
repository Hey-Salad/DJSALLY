import { NextResponse } from "next/server"
import { requireAccountSession } from "@/lib/account-session"
import { buildSandboxLaunchPlan, createUserSandbox } from "@/packages/dj-sally-vercel-control/src"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const { account } = await requireAccountSession()
    const body = await request.json().catch(() => ({})) as { create?: boolean }
    const plan = buildSandboxLaunchPlan(account)

    if (!body.create || process.env.DJ_SALLY_ENABLE_SANDBOX_CREATE !== "1") {
      return NextResponse.json({
        ok: true,
        created: false,
        reason: "Sandbox creation is disabled by default. Set DJ_SALLY_ENABLE_SANDBOX_CREATE=1 to create live sandboxes.",
        plan,
      })
    }

    const sandbox = await createUserSandbox(account)
    return NextResponse.json({ ok: true, created: true, sandbox })
  } catch (error) {
    if (error instanceof Response) return error
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to prepare sandbox" }, { status: 500 })
  }
}
