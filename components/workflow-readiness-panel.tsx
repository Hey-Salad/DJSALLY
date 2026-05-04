"use client"

import { useState } from "react"
import { GitBranch, ListChecks, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

type WorkflowState = "idle" | "starting" | "started" | "error"

export function WorkflowReadinessPanel() {
  const [state, setState] = useState<WorkflowState>("idle")
  const [runId, setRunId] = useState<string | null>(null)
  const [message, setMessage] = useState("Durable set-prep agent ready")

  const startWorkflow = async () => {
    setState("starting")
    setMessage("Starting Workflow SDK run")

    try {
      const response = await fetch("/api/workflows/dj-set-readiness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operator: "DJ Sally",
          venue: "Vercel Agent Hackathon",
          targetVolume: 58,
          controllerCount: 2,
          notes: "Prepare the two matching HID decks and Android/Bluetooth media volume path.",
        }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Workflow start failed")
      }

      setRunId(payload.runId)
      setState("started")
      setMessage("Workflow run queued")
    } catch (error) {
      setRunId(null)
      setState("error")
      setMessage(error instanceof Error ? error.message : "Workflow unavailable")
    }
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border/50 bg-secondary/40">
            <GitBranch className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">Vercel Workflow Set Readiness</p>
              <Badge variant="outline">WDK</Badge>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {runId ? `${message}: ${runId}` : message}
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={state === "starting"}
          onClick={() => void startWorkflow()}
        >
          {state === "starting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
          Start readiness workflow
        </Button>
      </div>
    </Card>
  )
}
