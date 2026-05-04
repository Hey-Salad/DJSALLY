import type { DjSallyUserAccount, SandboxLaunchPlan } from "./types"

export function buildSandboxLaunchPlan(account: DjSallyUserAccount): SandboxLaunchPlan {
  const { sandbox, aiGateway } = account.setup

  return {
    accountId: account.id,
    runtime: sandbox.runtime,
    timeoutMs: sandbox.timeoutMs,
    vcpus: sandbox.vcpus,
    networkPolicy: sandbox.networkPolicy,
    env: {
      DJ_SALLY_ACCOUNT_ID: account.id,
      DJ_SALLY_AI_MODEL: aiGateway.model,
      DJ_SALLY_SANDBOX_MODE: "user-setup",
    },
    bootstrapCommands: [
      "node --version",
      "printf 'DJ Sally sandbox ready for account %s\\n' \"$DJ_SALLY_ACCOUNT_ID\"",
      "printf 'AI Gateway model: %s\\n' \"$DJ_SALLY_AI_MODEL\"",
    ],
  }
}

export async function createUserSandbox(account: DjSallyUserAccount) {
  const { Sandbox } = await import("@vercel/sandbox")
  const plan = buildSandboxLaunchPlan(account)
  const sandbox = await Sandbox.create({
    runtime: plan.runtime,
    timeout: plan.timeoutMs,
    resources: { vcpus: plan.vcpus },
    env: plan.env,
  })

  return {
    sandboxId: sandbox.sandboxId,
    runtime: plan.runtime,
    status: sandbox.status,
    plan,
  }
}
