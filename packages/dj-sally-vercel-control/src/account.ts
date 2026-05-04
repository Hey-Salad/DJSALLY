import type { DjSallyUserAccount, UserSetup } from "./types"

export function createDefaultUserSetup(): UserSetup {
  return {
    hardware: {
      deckMappingMode: "auto",
      controllerCount: 2,
      targetVolume: 58,
    },
    aiGateway: {
      model: "openai/gpt-5.4-mini",
      monthlyBudgetUsd: 10,
      zeroDataRetention: true,
    },
    sandbox: {
      runtime: "node24",
      timeoutMs: 5 * 60 * 1000,
      vcpus: 1,
      networkPolicy: "restricted-ai-gateway",
    },
  }
}

export function createUserAccount(input: {
  email?: string
  displayName?: string
  now?: Date
  setup?: Partial<UserSetup>
}): DjSallyUserAccount {
  const now = (input.now ?? new Date()).toISOString()
  const email = normalizeEmail(input.email)
  const displayName = cleanText(input.displayName, email ? email.split("@")[0] : "DJ Sally user")

  return {
    id: `acct_${stableId(`${email || displayName}:${now}`)}`,
    email,
    displayName,
    createdAt: now,
    updatedAt: now,
    setup: mergeUserSetup(createDefaultUserSetup(), input.setup),
  }
}

export function updateUserSetup(account: DjSallyUserAccount, patch: Partial<UserSetup>): DjSallyUserAccount {
  return {
    ...account,
    updatedAt: new Date().toISOString(),
    setup: mergeUserSetup(account.setup, patch),
  }
}

export function mergeUserSetup(base: UserSetup, patch: Partial<UserSetup> | undefined): UserSetup {
  return {
    hardware: {
      ...base.hardware,
      ...patch?.hardware,
      controllerCount: clampInteger(patch?.hardware?.controllerCount, base.hardware.controllerCount, 0, 4),
      targetVolume: clampInteger(patch?.hardware?.targetVolume, base.hardware.targetVolume, 0, 100),
    },
    aiGateway: {
      ...base.aiGateway,
      ...patch?.aiGateway,
      model: cleanText(patch?.aiGateway?.model, base.aiGateway.model),
      monthlyBudgetUsd: clampInteger(patch?.aiGateway?.monthlyBudgetUsd, base.aiGateway.monthlyBudgetUsd, 0, 10000),
      zeroDataRetention: patch?.aiGateway?.zeroDataRetention ?? base.aiGateway.zeroDataRetention,
    },
    sandbox: {
      ...base.sandbox,
      ...patch?.sandbox,
      runtime: patch?.sandbox?.runtime ?? base.sandbox.runtime,
      timeoutMs: clampInteger(patch?.sandbox?.timeoutMs, base.sandbox.timeoutMs, 60_000, 5 * 60 * 60 * 1000),
      vcpus: clampInteger(patch?.sandbox?.vcpus, base.sandbox.vcpus, 1, 4),
      networkPolicy: patch?.sandbox?.networkPolicy ?? base.sandbox.networkPolicy,
    },
  }
}

function normalizeEmail(value: string | undefined) {
  return value?.trim().toLowerCase().slice(0, 160) ?? ""
}

function cleanText(value: string | undefined, fallback: string) {
  const trimmed = value?.trim()
  return trimmed ? trimmed.slice(0, 160) : fallback
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.isFinite(value) ? Math.round(value as number) : fallback
  return Math.min(max, Math.max(min, parsed))
}

function stableId(value: string) {
  let hash = 5381
  for (const char of value) {
    hash = ((hash << 5) + hash) ^ char.charCodeAt(0)
  }
  return Math.abs(hash).toString(36)
}
