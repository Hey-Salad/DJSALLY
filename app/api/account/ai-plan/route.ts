import { gateway } from "@ai-sdk/gateway"
import { generateText } from "ai"
import { NextResponse } from "next/server"
import { requireAccountSession } from "@/lib/account-session"
import { buildGatewayPrompt, buildGatewaySystemPrompt, fallbackAiSetupPlan } from "@/packages/dj-sally-vercel-control/src"

export const runtime = "nodejs"

export async function POST() {
  try {
    const { account } = await requireAccountSession()
    const model = account.setup.aiGateway.model

    try {
      const result = await generateText({
        model: gateway(model),
        system: buildGatewaySystemPrompt(account),
        prompt: buildGatewayPrompt(account),
        providerOptions: {
          gateway: {
            user: account.id,
            tags: ["dj-sally", "account-setup"],
            quotaEntityId: account.id,
            zeroDataRetention: account.setup.aiGateway.zeroDataRetention,
          },
        },
      })

      return NextResponse.json({
        ok: true,
        gatewayAvailable: true,
        model,
        plan: {
          title: "AI Gateway account setup plan",
          summary: result.text,
          steps: [],
          risks: [],
          model,
        },
      })
    } catch (error) {
      return NextResponse.json({
        ok: true,
        gatewayAvailable: false,
        model,
        plan: fallbackAiSetupPlan(account, error instanceof Error ? error.message : "unknown error"),
      })
    }
  } catch (error) {
    if (error instanceof Response) return error
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create AI setup plan" }, { status: 500 })
  }
}
