export type DeckMappingMode = "auto" | "manual"
export type SandboxRuntime = "node24" | "node22" | "python3.13"

export interface AiGatewaySetup {
  model: string
  monthlyBudgetUsd: number
  zeroDataRetention: boolean
}

export interface SandboxSetup {
  runtime: SandboxRuntime
  timeoutMs: number
  vcpus: number
  networkPolicy: "restricted-ai-gateway" | "full" | "none"
}

export interface HardwareSetup {
  deckMappingMode: DeckMappingMode
  controllerCount: number
  targetVolume: number
  deckAUsbDevice?: string
  deckBUsbDevice?: string
}

export interface UserSetup {
  hardware: HardwareSetup
  aiGateway: AiGatewaySetup
  sandbox: SandboxSetup
}

export interface DjSallyUserAccount {
  id: string
  email: string
  displayName: string
  createdAt: string
  updatedAt: string
  setup: UserSetup
}

export interface AccountSession {
  account: DjSallyUserAccount
  expiresAt: string
}

export interface SandboxLaunchPlan {
  accountId: string
  runtime: SandboxRuntime
  timeoutMs: number
  vcpus: number
  networkPolicy: SandboxSetup["networkPolicy"]
  env: Record<string, string>
  bootstrapCommands: string[]
}

export interface AiSetupPlan {
  title: string
  summary: string
  steps: string[]
  risks: string[]
  model: string
}
