"use client"

import { useEffect, useState } from "react"
import { Bot, Box, Loader2, LogOut, UserRound } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

interface AccountPayload {
  authenticated: boolean
  account: {
    id: string
    email: string
    displayName: string
    setup: {
      hardware: { targetVolume: number; controllerCount: number; deckMappingMode: string }
      aiGateway: { model: string; monthlyBudgetUsd: number; zeroDataRetention: boolean }
      sandbox: { runtime: string; timeoutMs: number; vcpus: number; networkPolicy: string }
    }
  } | null
  warning?: string | null
}

export function AccountSetupPanel() {
  const [payload, setPayload] = useState<AccountPayload | null>(null)
  const [displayName, setDisplayName] = useState("DJ Sally")
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState("Account setup ready")
  const [pending, setPending] = useState<string | null>(null)
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [sandboxSummary, setSandboxSummary] = useState<string | null>(null)

  const refreshAccount = async () => {
    const response = await fetch("/api/account")
    const nextPayload = await response.json()
    setPayload(nextPayload)
    if (nextPayload.account) {
      setDisplayName(nextPayload.account.displayName)
      setEmail(nextPayload.account.email)
    }
  }

  useEffect(() => {
    void refreshAccount()
  }, [])

  const createAccount = async () => {
    setPending("account")
    setStatus("Creating account")

    try {
      const response = await fetch("/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, email }),
      })
      const nextPayload = await response.json()
      setPayload(nextPayload)
      setStatus("Account session active")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Account failed")
    } finally {
      setPending(null)
    }
  }

  const createAiPlan = async () => {
    setPending("ai")
    setStatus("Routing setup through AI Gateway")

    try {
      const response = await fetch("/api/account/ai-plan", { method: "POST" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "AI setup failed")
      setAiSummary(result.plan.summary)
      setStatus(result.gatewayAvailable ? "AI Gateway plan generated" : "Fallback plan generated")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "AI setup failed")
    } finally {
      setPending(null)
    }
  }

  const prepareSandbox = async () => {
    setPending("sandbox")
    setStatus("Preparing sandbox launch plan")

    try {
      const response = await fetch("/api/account/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ create: false }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Sandbox setup failed")
      setSandboxSummary(`${result.plan.runtime}, ${Math.round(result.plan.timeoutMs / 1000)}s, ${result.plan.vcpus} vCPU`)
      setStatus("Sandbox launch plan ready")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Sandbox setup failed")
    } finally {
      setPending(null)
    }
  }

  const signOut = async () => {
    setPending("signout")
    await fetch("/api/account", { method: "DELETE" })
    setPayload({ authenticated: false, account: null })
    setAiSummary(null)
    setSandboxSummary(null)
    setStatus("Signed out")
    setPending(null)
  }

  const account = payload?.account

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur p-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border/50 bg-secondary/40">
              <UserRound className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">Personal DJ Sally Account</p>
                <Badge variant={account ? "default" : "outline"}>{account ? "Signed in" : "Demo auth"}</Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {account ? `${account.displayName} · ${account.id}` : status}
              </p>
            </div>
          </div>

          {account ? (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => void signOut()}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          ) : (
            <div className="grid gap-2 md:grid-cols-[minmax(0,180px)_minmax(0,220px)_auto]">
              <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Display name" />
              <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@example.com" />
              <Button size="sm" className="gap-2" disabled={pending === "account"} onClick={() => void createAccount()}>
                {pending === "account" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRound className="h-4 w-4" />}
                Create account
              </Button>
            </div>
          )}
        </div>

        {account && (
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded border border-border/50 bg-secondary/20 p-3">
              <p className="text-xs font-medium">Setup</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {account.setup.hardware.controllerCount} controllers · {account.setup.hardware.deckMappingMode} mapping · {account.setup.hardware.targetVolume}% target
              </p>
            </div>
            <div className="rounded border border-border/50 bg-secondary/20 p-3">
              <p className="text-xs font-medium">AI Gateway</p>
              <p className="mt-1 text-xs text-muted-foreground">{account.setup.aiGateway.model} · ${account.setup.aiGateway.monthlyBudgetUsd}/mo</p>
            </div>
            <div className="rounded border border-border/50 bg-secondary/20 p-3">
              <p className="text-xs font-medium">Sandbox</p>
              <p className="mt-1 text-xs text-muted-foreground">{sandboxSummary ?? `${account.setup.sandbox.runtime} · ${account.setup.sandbox.vcpus} vCPU`}</p>
            </div>
          </div>
        )}

        {account && (
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <p className="min-w-0 text-xs text-muted-foreground">{aiSummary ?? status}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-2" disabled={pending === "ai"} onClick={() => void createAiPlan()}>
                {pending === "ai" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                AI setup plan
              </Button>
              <Button variant="outline" size="sm" className="gap-2" disabled={pending === "sandbox"} onClick={() => void prepareSandbox()}>
                {pending === "sandbox" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Box className="h-4 w-4" />}
                Sandbox plan
              </Button>
            </div>
          </div>
        )}

        {payload?.warning && <p className="text-[11px] text-muted-foreground">{payload.warning}</p>}
      </div>
    </Card>
  )
}
