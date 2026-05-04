import { sleep } from "workflow"

export interface DjSetReadinessInput {
  operator?: string
  venue?: string
  targetVolume?: number
  controllerCount?: number
  notes?: string
}

export interface DjSetReadinessResult {
  runId: string
  status: "ready"
  operator: string
  venue: string
  targetVolume: number
  controllerCount: number
  checklist: string[]
  risks: string[]
  runbook: string[]
  resources: { label: string; url: string }[]
}

interface NormalizedSetInput {
  operator: string
  venue: string
  targetVolume: number
  controllerCount: number
  notes: string
  requestedAt: string
}

export async function djSetReadinessWorkflow(input: DjSetReadinessInput = {}): Promise<DjSetReadinessResult> {
  "use workflow"

  const normalized = await normalizeSetInput(input)
  const checklist = await prepareHardwareChecklist(normalized)
  const risks = await assessShowRisks(normalized, checklist)

  await sleep("2s")

  const runbook = await compileReadinessRunbook(normalized, risks)

  return {
    runId: `readiness-${normalized.requestedAt}`,
    status: "ready",
    operator: normalized.operator,
    venue: normalized.venue,
    targetVolume: normalized.targetVolume,
    controllerCount: normalized.controllerCount,
    checklist,
    risks,
    runbook,
    resources: [
      { label: "Workflow SDK docs", url: "https://workflow-sdk.dev/" },
      { label: "Workflow on Vercel", url: "https://vercel.com/docs/workflow" },
      { label: "Durable AI agents guide", url: "https://useworkflow.dev/docs/ai" },
      { label: "Vercel workflow repo", url: "https://github.com/vercel/workflow" },
      { label: "Workflow examples", url: "https://github.com/vercel/workflow-examples" },
      { label: "Workflow workshop", url: "https://github.com/vercel-labs/workflow-workshop" },
      { label: "Claude managed agent on Vercel", url: "https://vercel.com/kb/guide/claude-managed-agent-vercel" },
    ],
  }
}

async function normalizeSetInput(input: DjSetReadinessInput): Promise<NormalizedSetInput> {
  "use step"

  return {
    operator: cleanText(input.operator, "DJ Sally operator"),
    venue: cleanText(input.venue, "Hackathon demo"),
    targetVolume: clampInteger(input.targetVolume, 58, 0, 100),
    controllerCount: clampInteger(input.controllerCount, 2, 0, 4),
    notes: cleanText(input.notes, "Two matching HID controllers mapped to deck controls and Android media volume."),
    requestedAt: new Date().toISOString(),
  }
}

async function prepareHardwareChecklist(input: NormalizedSetInput): Promise<string[]> {
  "use step"

  const checklist = [
    `Confirm ${input.controllerCount} HID controllers are detected and assigned to stable USB paths.`,
    "Verify clockwise knob rotation raises Android/Bluetooth media volume.",
    "Verify anti-clockwise knob rotation lowers Android/Bluetooth media volume.",
    `Set media output near ${input.targetVolume}% before the first transition.`,
    "Keep the Vercel dashboard open as the public control and status surface.",
  ]

  if (input.notes) {
    checklist.push(`Operator note: ${input.notes}`)
  }

  return checklist
}

async function assessShowRisks(input: NormalizedSetInput, checklist: string[]): Promise<string[]> {
  "use step"

  const risks = []

  if (input.controllerCount < 2) {
    risks.push("Only one controller is expected; deck mirroring will be limited.")
  }

  if (input.targetVolume < 20) {
    risks.push("Target volume is low enough that Android hardware quantization may hide small knob changes.")
  }

  if (input.targetVolume > 85) {
    risks.push("Target volume is high; verify the Bluetooth output chain before starting playback.")
  }

  if (checklist.length < 4) {
    risks.push("Readiness checklist is incomplete.")
  }

  return risks.length ? risks : ["No blocking risks detected for the submitted demo flow."]
}

async function compileReadinessRunbook(input: NormalizedSetInput, risks: string[]): Promise<string[]> {
  "use step"

  return [
    `Start ${input.venue} with ${input.operator} at the controller station.`,
    "Open the public Vercel dashboard and confirm it renders without probing a local WebSocket.",
    "Start the local bridge when physical HID control is needed.",
    "Use the mapped knob for fast 7% volume steps against the Android media stream.",
    risks[0],
  ]
}

function cleanText(value: string | undefined, fallback: string) {
  const trimmed = value?.trim()
  return trimmed ? trimmed.slice(0, 240) : fallback
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.isFinite(value) ? Math.round(value as number) : fallback
  return Math.min(max, Math.max(min, parsed))
}
