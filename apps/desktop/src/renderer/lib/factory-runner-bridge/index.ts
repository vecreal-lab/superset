import type { AgentLaunchRequest } from "@superset/shared/agent-launch";

export interface FactoryRunnerCommandInput {
	factoryRoot: string;
	workOrderPath: string;
	provider?: "dry-run" | "codex-cli" | "claude-cli" | "openai-image" | "openai-image-manual";
	model?: string;
	runId?: string;
	outDir?: string;
	role?: string;
}

function quotePowerShell(value: string): string {
	return `"${value.replace(/"/g, '`"')}"`;
}

export function buildFactoryRunnerCommand({
	workOrderPath,
	provider = "codex-cli",
	model = provider === "claude-cli" ? "claude-opus-4-7" : "gpt-5.4",
	runId,
	outDir,
	role,
}: FactoryRunnerCommandInput): string {
	const args = [
		"node",
		"tools/factory-runner/run-work-order.mjs",
		"--work-order",
		workOrderPath,
		"--provider",
		provider,
		"--model",
		model,
	];
	if (runId) args.push("--run-id", runId);
	if (outDir) args.push("--out-dir", outDir);

	const env = [
		'$env:FACTORY_LOCAL_ONLY="true"',
		'$env:NODE_OPTIONS="--max-old-space-size=8192"',
		'$env:FACTORY_CODEX_MODEL="gpt-5.4"',
		'$env:FACTORY_CODEX_REASONING_EFFORT="xhigh"',
		'$env:FACTORY_CLAUDE_MODEL="claude-opus-4-7"',
		'$env:FACTORY_CLAUDE_EFFORT="max"',
	];
	if (role) {
		env.push(`$env:FACTORY_ROLE=${quotePowerShell(role)}`);
	}

	return [...env, `& ${args.map(quotePowerShell).join(" ")}`].join("; ");
}

export function buildFactoryRunnerLaunchRequest({
	workspaceId,
	factoryRoot,
	workOrderPath,
	provider,
	model,
	runId,
	outDir,
	role,
}: FactoryRunnerCommandInput & { workspaceId: string }): AgentLaunchRequest {
	return {
		kind: "terminal",
		workspaceId,
		agentType: provider ?? "codex-cli",
		source: "unknown",
		idempotencyKey: runId ? `factory-runner:${runId}` : undefined,
		terminal: {
			name: runId ? `Factory ${runId}` : "Factory runner",
			command: buildFactoryRunnerCommand({
				factoryRoot,
				workOrderPath,
				provider,
				model,
				runId,
				outDir,
				role,
			}),
		},
	};
}
