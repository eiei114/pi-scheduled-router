import { join } from "node:path";
import { existsSync } from "node:fs";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export const CONFIG_FILENAME = "scheduled-router.yaml";

export function projectConfigPath(cwd: string): string {
  return join(cwd, ".pi", CONFIG_FILENAME);
}

export function agentConfigPath(): string {
  return join(getAgentDir(), CONFIG_FILENAME);
}

/** Resolves the config path: project-local `.pi/` first, then agent dir. */
export function resolveConfigPath(ctx: ExtensionContext): string | undefined {
  const projectPath = projectConfigPath(ctx.cwd);
  if (existsSync(projectPath)) return projectPath;

  const agentPath = agentConfigPath();
  if (existsSync(agentPath)) return agentPath;

  return undefined;
}
