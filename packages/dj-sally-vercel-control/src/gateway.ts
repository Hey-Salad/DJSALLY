import type { AiSetupPlan, DjSallyUserAccount } from "./types"

export function buildGatewaySystemPrompt(account: DjSallyUserAccount) {
  return [
    "You are DJ Sally's setup agent.",
    "Return concise, practical instructions for a user configuring HID decks, Vercel AI Gateway, and Vercel Sandbox.",
    `User: ${account.displayName}`,
    `Preferred model: ${account.setup.aiGateway.model}`,
    `Budget cap: $${account.setup.aiGateway.monthlyBudgetUsd}/month`,
    `Zero data retention requested: ${account.setup.aiGateway.zeroDataRetention ? "yes" : "no"}`,
  ].join("\n")
}

export function buildGatewayPrompt(account: DjSallyUserAccount) {
  const { hardware, sandbox } = account.setup
  return [
    `Create a setup plan for ${account.displayName}.`,
    `Controllers: ${hardware.controllerCount}, mapping: ${hardware.deckMappingMode}, target volume: ${hardware.targetVolume}%.`,
    `Sandbox runtime: ${sandbox.runtime}, timeout: ${sandbox.timeoutMs}ms, vCPUs: ${sandbox.vcpus}.`,
    "Include authentication, per-user isolation, AI Gateway routing, and sandbox safety steps.",
  ].join("\n")
}

export function fallbackAiSetupPlan(account: DjSallyUserAccount, reason?: string): AiSetupPlan {
  return {
    title: "DJ Sally account setup plan",
    summary: reason
      ? `Generated locally because AI Gateway was unavailable: ${reason}`
      : "Generated locally from the account setup.",
    model: account.setup.aiGateway.model,
    steps: [
      "Create or restore the signed DJ Sally account session.",
      "Save the user's HID deck mapping, volume target, AI model, and sandbox limits under their account setup.",
      "Route AI calls through Vercel AI Gateway server-side and tag requests with the account id.",
      "Create Vercel Sandboxes from server routes only, using Vercel OIDC and per-user runtime limits.",
      "Keep provider keys, sandbox credentials, and Sally device tokens off the client.",
    ],
    risks: [
      "Cookie-backed sessions are suitable for the hackathon demo; production should replace this with OAuth plus a durable database.",
      "Sandbox creation should stay disabled by default until cost controls and abuse protection are configured.",
    ],
  }
}
