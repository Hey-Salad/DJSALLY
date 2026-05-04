import { NextResponse } from "next/server"
import { start } from "workflow/api"
import { djSetReadinessWorkflow, type DjSetReadinessInput } from "@/workflows/dj-set-readiness"

export const runtime = "nodejs"

export async function GET() {
  return NextResponse.json({
    name: "DJ Sally Set Readiness",
    track: "Vercel Workflow (WDK)",
    workflow: "djSetReadinessWorkflow",
    description: "Starts a durable Workflow SDK run that prepares DJ Sally's hardware, audio, and demo checklist.",
    resources: [
      "https://workflow-sdk.dev/",
      "https://vercel.com/docs/workflow",
      "https://useworkflow.dev/docs/ai",
      "https://github.com/vercel/workflow",
      "https://github.com/vercel/workflow-examples",
      "https://github.com/vercel-labs/workflow-workshop",
    ],
  })
}

export async function POST(request: Request) {
  const input = await request.json().catch(() => ({})) as DjSetReadinessInput
  const run = await start(djSetReadinessWorkflow, [input])

  return NextResponse.json({
    ok: true,
    message: "DJ Sally readiness workflow started",
    runId: run.runId,
    workflow: "djSetReadinessWorkflow",
  })
}
