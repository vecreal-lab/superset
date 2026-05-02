import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export type FactoryCliProvider = "claude" | "codex";

export interface FactoryCliStatus {
	provider: FactoryCliProvider;
	label: string;
	connected: boolean;
	binaryOk: boolean;
	roundTripOk: boolean;
	version?: string;
	checkedAt: string;
	message: string;
	details?: string;
	failureKind?: "binary_missing" | "auth" | "network" | "unknown";
}

export interface FactoryCliInvocationResult {
	text: string;
	sessionId?: string;
	exitCode: number;
	stderr: string;
	spawned: number;
	cleaned: number;
}

export interface FactoryCliInvokeInput {
	provider: FactoryCliProvider;
	roleId: string;
	prompt: string;
	dialogueId: string;
	signal?: AbortSignal;
	onChunk?: (chunk: string) => void;
}

export interface FactoryCliGoalIterativeVerificationCommand {
	command: string;
	required?: boolean;
}

export interface FactoryCliGoalIterativeInput {
	workOrderId: string;
	prompt: string;
	allowedPaths: string[];
	verificationCommands: FactoryCliGoalIterativeVerificationCommand[];
	maxIterations?: number;
	maxRuntimeMinutes?: number;
	signal?: AbortSignal;
	onChunk?: (chunk: string) => void;
}

export interface FactoryCliGoalIterativeVerificationOutcome {
	command: string;
	exitCode: number;
	stdout: string;
	stderr: string;
	durationMs: number;
}

export interface FactoryCliGoalIterativeIteration {
	iteration: number;
	codexExitCode: number;
	codexStdout: string;
	codexStderr: string;
	verification: FactoryCliGoalIterativeVerificationOutcome[];
}

export interface FactoryCliGoalIterativeResult {
	success: boolean;
	iterations: FactoryCliGoalIterativeIteration[];
	spawned: number;
	cleaned: number;
	failureReason?: string;
}

interface CommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	timedOut: boolean;
}

const CLI_STATUS_TTL_MS = 5 * 60 * 1000;
const HEALTH_TIMEOUT_MS = 90_000;
const INVOCATION_TIMEOUT_MS = 10 * 60_000;
const GOAL_ITERATIVE_DEFAULT_MAX_ITERATIONS = 10;
const GOAL_ITERATIVE_DEFAULT_MAX_RUNTIME_MINUTES = 120;
const CLAUDE_MODEL = "claude-opus-4-7";
const CODEX_MODEL = "gpt-5.4";

const claudeStartedSessions = new Set<string>();

const cachedStatuses = new Map<
	FactoryCliProvider,
	{ checkedAtMs: number; status: FactoryCliStatus }
>();

function normalizeSlashes(value: string): string {
	return value.replace(/\\/g, "/");
}

function findFactoryRoot(): string {
	const explicit =
		process.env.SOFTWARE_FACTORY_ROOT || process.env.FACTORY_ROOT || "";
	const startCandidates = [
		explicit,
		process.cwd(),
		path.resolve(process.cwd(), ".."),
		path.resolve(process.cwd(), "..", ".."),
		path.resolve(process.cwd(), "..", "..", ".."),
	].filter(Boolean);

	for (const start of startCandidates) {
		let current = path.resolve(start);
		while (true) {
			if (
				existsSync(path.join(current, "work-orders")) &&
				existsSync(path.join(current, "tools", "factory-runner"))
			) {
				return current;
			}
			const next = path.dirname(current);
			if (next === current) break;
			current = next;
		}
	}

	return path.resolve(process.cwd(), "..", "..");
}

function cliEnv(): NodeJS.ProcessEnv {
	const next: NodeJS.ProcessEnv = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (/^(ANTHROPIC|OPENAI).*KEY$/i.test(key)) continue;
		next[key] = value;
	}
	next.FACTORY_LOCAL_ONLY = "true";
	next.SUPERSET_SKIP_NOTIFY_HOOK = "1";
	return next;
}

function nowIso(): string {
	return new Date().toISOString();
}

function providerLabel(provider: FactoryCliProvider): string {
	return provider === "claude" ? "Claude CLI" : "Codex CLI";
}

function classifyFailure(raw: string): FactoryCliStatus["failureKind"] {
	const lower = raw.toLowerCase();
	if (
		lower.includes("not recognized") ||
		lower.includes("enoent") ||
		lower.includes("could not find") ||
		lower.includes("not found")
	) {
		return "binary_missing";
	}
	if (
		lower.includes("auth") ||
		lower.includes("login") ||
		lower.includes("unauthorized") ||
		lower.includes("401") ||
		lower.includes("expired") ||
		lower.includes("not logged in")
	) {
		return "auth";
	}
	if (
		lower.includes("network") ||
		lower.includes("econn") ||
		lower.includes("timeout") ||
		lower.includes("timed out") ||
		lower.includes("service unavailable")
	) {
		return "network";
	}
	return "unknown";
}

function statusFailureMessage(
	provider: FactoryCliProvider,
	failureKind: FactoryCliStatus["failureKind"],
): string {
	if (failureKind === "binary_missing") {
		return `Install ${providerLabel(provider)} and restart the cockpit.`;
	}
	if (failureKind === "auth") {
		return `Run ${provider === "claude" ? "claude" : "codex"} login in a terminal, then click Reconnect.`;
	}
	if (failureKind === "network") {
		return "Check network/service status, then click Reconnect.";
	}
	return "Check the CLI output, then click Reconnect.";
}

async function runCommand(
	command: string,
	args: string[],
	options: {
		input?: string;
		timeoutMs?: number;
		signal?: AbortSignal;
		onStdout?: (chunk: string) => void;
	} = {},
): Promise<CommandResult> {
	return new Promise((resolve) => {
		let stdout = "";
		let stderr = "";
		let settled = false;
		let timedOut = false;
		const invocation = resolveCommandInvocation(command, args);
		const child = spawn(invocation.command, invocation.args, {
			cwd: findFactoryRoot(),
			env: cliEnv(),
			shell: false,
			windowsHide: true,
			stdio: ["pipe", "pipe", "pipe"],
		});

		const finish = (exitCode: number) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			resolve({ exitCode, stdout, stderr, timedOut });
		};

		const timeout = setTimeout(() => {
			timedOut = true;
			child.kill();
		}, options.timeoutMs || HEALTH_TIMEOUT_MS);

		const abort = () => {
			child.kill();
			finish(130);
		};
		options.signal?.addEventListener("abort", abort, { once: true });

		child.stdout.on("data", (chunk: Buffer) => {
			const text = chunk.toString("utf8");
			stdout += text;
			options.onStdout?.(text);
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf8");
		});
		child.on("error", (error) => {
			stderr += error.message;
			finish(1);
		});
		child.on("close", (code) => {
			options.signal?.removeEventListener("abort", abort);
			finish(code ?? 0);
		});

		if (options.input) {
			child.stdin.end(options.input);
		} else {
			child.stdin.end();
		}
	});
}

function resolveCommandInvocation(
	command: string,
	args: string[],
): { command: string; args: string[] } {
	if (process.platform !== "win32") return { command, args };
	const where = spawnSync("where.exe", [command], {
		encoding: "utf8",
		windowsHide: true,
	});
	const candidates = `${where.stdout || ""}`
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	const npmShim = candidates.find((candidate) =>
		normalizeSlashes(candidate).toLowerCase().endsWith(`/npm/${command}`),
	);
	if (npmShim) {
		const baseDir = path.dirname(npmShim);
		const cliPath =
			command === "claude"
				? path.join(baseDir, "node_modules", "@anthropic-ai", "claude-code", "cli.js")
				: command === "codex"
					? path.join(baseDir, "node_modules", "@openai", "codex", "bin", "codex.js")
					: "";
		if (cliPath && existsSync(cliPath)) {
			return { command: "node", args: [cliPath, ...args] };
		}
	}
	const executable = candidates.find((candidate) =>
		candidate.toLowerCase().endsWith(".exe"),
	);
	if (executable) return { command: executable, args };
	return { command, args };
}

async function checkProvider(
	provider: FactoryCliProvider,
	force = false,
): Promise<FactoryCliStatus> {
	const cached = cachedStatuses.get(provider);
	if (!force && cached && Date.now() - cached.checkedAtMs < CLI_STATUS_TTL_MS) {
		return cached.status;
	}

	const label = providerLabel(provider);
	const command = provider === "claude" ? "claude" : "codex";
	const versionResult = await runCommand(command, ["--version"], {
		timeoutMs: 20_000,
	});
	const versionOutput = `${versionResult.stdout}${versionResult.stderr}`.trim();

	if (versionResult.exitCode !== 0) {
		const failureKind = classifyFailure(versionOutput);
		const status: FactoryCliStatus = {
			provider,
			label,
			connected: false,
			binaryOk: false,
			roundTripOk: false,
			checkedAt: nowIso(),
			message: statusFailureMessage(provider, failureKind),
			details: versionOutput,
			failureKind,
		};
		cachedStatuses.set(provider, { checkedAtMs: Date.now(), status });
		return status;
	}

	const pingResult =
		provider === "claude"
			? await runCommand(
					"claude",
					[
						"-p",
						"--setting-sources",
						"project,local",
						"--output-format",
						"json",
						"--model",
						CLAUDE_MODEL,
						"--effort",
						"max",
					],
					{ input: "respond OK", timeoutMs: HEALTH_TIMEOUT_MS },
				)
			: await runCommand(
					"codex",
					[
						"exec",
						"-m",
						CODEX_MODEL,
						"-c",
						'model_reasoning_effort="xhigh"',
						"-c",
						'model_reasoning_summary="detailed"',
						"--sandbox",
						"read-only",
						"--skip-git-repo-check",
						"-",
					],
					{ input: "respond exactly OK", timeoutMs: HEALTH_TIMEOUT_MS },
				);
	const pingOutput = `${pingResult.stdout}\n${pingResult.stderr}`.trim();
	const roundTripOk = pingResult.exitCode === 0 && /\bOK\b/.test(pingOutput);
	const failureKind = roundTripOk ? undefined : classifyFailure(pingOutput);
	const status: FactoryCliStatus = {
		provider,
		label,
		connected: roundTripOk,
		binaryOk: true,
		roundTripOk,
		version: versionOutput.split(/\r?\n/)[0],
		checkedAt: nowIso(),
		message: roundTripOk
			? `${label} connected`
			: statusFailureMessage(provider, failureKind),
		details: roundTripOk
			? normalizeSlashes(versionOutput)
			: normalizeSlashes(pingOutput),
		failureKind,
	};
	cachedStatuses.set(provider, { checkedAtMs: Date.now(), status });
	return status;
}

function extractClaudeChunk(line: string): { chunk?: string; result?: string; sessionId?: string } {
	try {
		const parsed = JSON.parse(line) as {
			type?: string;
			session_id?: string;
			result?: string;
			event?: {
				type?: string;
				delta?: { type?: string; text?: string };
			};
			message?: { content?: Array<{ type?: string; text?: string }> };
		};
		const event = parsed.event;
		if (
			parsed.type === "stream_event" &&
			event?.type === "content_block_delta" &&
			event.delta?.type === "text_delta"
		) {
			return { chunk: event.delta.text || "", sessionId: parsed.session_id };
		}
		if (parsed.type === "assistant") {
			const text = parsed.message?.content
				?.map((part) => (part.type === "text" ? part.text || "" : ""))
				.join("");
			return { result: text, sessionId: parsed.session_id };
		}
		if (parsed.type === "result") {
			return { result: parsed.result || "", sessionId: parsed.session_id };
		}
		return { sessionId: parsed.session_id };
	} catch {
		return {};
	}
}

type ClaudeSessionMode = "session-id" | "resume";

function claudeSessionArgs(dialogueId: string, mode: ClaudeSessionMode): string[] {
	return mode === "resume" ? ["--resume", dialogueId] : ["--session-id", dialogueId];
}

function isClaudeSessionAlreadyInUse(result: CommandResult): boolean {
	return `${result.stderr}\n${result.stdout}`.toLowerCase().includes("already in use");
}

export async function checkFactoryCliStatuses(
	force = false,
): Promise<FactoryCliStatus[]> {
	return Promise.all([checkProvider("claude", force), checkProvider("codex", force)]);
}

export async function invokeFactoryCliRole(
	input: FactoryCliInvokeInput,
): Promise<FactoryCliInvocationResult> {
	if (input.provider === "codex") {
		const result = await runCommand(
			"codex",
			[
				"exec",
				"-m",
				CODEX_MODEL,
				"-c",
				'model_reasoning_effort="xhigh"',
				"-c",
				'model_reasoning_summary="detailed"',
				"--sandbox",
				"read-only",
				"--skip-git-repo-check",
				"-",
			],
			{
				input: input.prompt,
				timeoutMs: INVOCATION_TIMEOUT_MS,
				signal: input.signal,
				onStdout: input.onChunk,
			},
		);
		if (result.exitCode !== 0) {
			throw new Error(`${providerLabel(input.provider)} failed: ${result.stderr || result.stdout}`);
		}
		return {
			text: result.stdout.trim(),
			exitCode: result.exitCode,
			stderr: result.stderr,
			spawned: 1,
			cleaned: 1,
		};
	}

	const runClaude = async (mode: ClaudeSessionMode) => {
		let buffer = "";
		let text = "";
		let finalResult = "";
		let sessionId: string | undefined;
		const result = await runCommand(
			"claude",
			[
				"-p",
				"--setting-sources",
				"project,local",
				"--output-format",
				"stream-json",
				"--include-partial-messages",
				"--verbose",
				"--model",
				CLAUDE_MODEL,
				"--effort",
				"max",
				...claudeSessionArgs(input.dialogueId, mode),
			],
			{
				input: input.prompt,
				timeoutMs: INVOCATION_TIMEOUT_MS,
				signal: input.signal,
				onStdout: (chunk) => {
					buffer += chunk;
					let newlineIndex = buffer.indexOf("\n");
					while (newlineIndex >= 0) {
						const line = buffer.slice(0, newlineIndex).trim();
						buffer = buffer.slice(newlineIndex + 1);
						if (line) {
							const parsed = extractClaudeChunk(line);
							if (parsed.sessionId) sessionId = parsed.sessionId;
							if (parsed.chunk) {
								text += parsed.chunk;
								input.onChunk?.(parsed.chunk);
							}
							if (parsed.result) finalResult = parsed.result;
						}
						newlineIndex = buffer.indexOf("\n");
					}
				},
			},
		);
		return { result, text, finalResult, sessionId };
	};

	const firstMode = claudeStartedSessions.has(input.dialogueId)
		? "resume"
		: "session-id";
	let claudeResult = await runClaude(firstMode);
	if (
		claudeResult.result.exitCode !== 0 &&
		firstMode === "session-id" &&
		isClaudeSessionAlreadyInUse(claudeResult.result)
	) {
		claudeResult = await runClaude("resume");
	}
	const { result, finalResult, sessionId } = claudeResult;
	let { text } = claudeResult;
	if (result.exitCode !== 0) {
		throw new Error(`${providerLabel(input.provider)} failed: ${result.stderr || result.stdout}`);
	}
	claudeStartedSessions.add(input.dialogueId);
	if (!text.trim() && finalResult.trim()) {
		text = finalResult;
		input.onChunk?.(finalResult);
	}
	return {
		text: text.trim(),
		sessionId,
		exitCode: result.exitCode,
		stderr: result.stderr,
		spawned: 1,
		cleaned: 1,
	};
}

export async function invokeFactoryCliGoalIterative(
	input: FactoryCliGoalIterativeInput,
): Promise<FactoryCliGoalIterativeResult> {
	const status = await checkProvider("codex", true);
	if (!status.connected) {
		return {
			success: false,
			iterations: [],
			spawned: 0,
			cleaned: 0,
			failureReason: status.details || status.message,
		};
	}

	const pathBlock = goalIterativePathBlock(input.allowedPaths);
	if (pathBlock) {
		return {
			success: false,
			iterations: [],
			spawned: 0,
			cleaned: 0,
			failureReason: pathBlock,
		};
	}

	const maxIterations = positiveInt(
		input.maxIterations,
		GOAL_ITERATIVE_DEFAULT_MAX_ITERATIONS,
	);
	const maxRuntimeMs =
		positiveInt(
			input.maxRuntimeMinutes,
			GOAL_ITERATIVE_DEFAULT_MAX_RUNTIME_MINUTES,
		) * 60_000;
	const startedAtMs = Date.now();
	const factoryRoot = findFactoryRoot();
	const allowedDirs = goalIterativeAllowedDirs(factoryRoot, input.allowedPaths);
	const iterations: FactoryCliGoalIterativeIteration[] = [];
	let prompt = input.prompt;
	let useResume = false;

	for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
		if (Date.now() - startedAtMs > maxRuntimeMs) {
			return {
				success: false,
				iterations,
				spawned: iterations.length,
				cleaned: iterations.length,
				failureReason: `max_runtime_minutes hit before iteration ${iteration}`,
			};
		}

		const codexResult = await runCommand(
			"codex",
			goalIterativeCodexArgs(factoryRoot, allowedDirs, useResume),
			{
				input: prompt,
				timeoutMs: Math.max(30_000, maxRuntimeMs - (Date.now() - startedAtMs)),
				signal: input.signal,
				onStdout: input.onChunk,
			},
		);

		if (codexResult.exitCode !== 0) {
			iterations.push({
				iteration,
				codexExitCode: codexResult.exitCode,
				codexStdout: codexResult.stdout,
				codexStderr: codexResult.stderr,
				verification: [],
			});
			return {
				success: false,
				iterations,
				spawned: iterations.length,
				cleaned: iterations.length,
				failureReason: codexResult.stderr || codexResult.stdout,
			};
		}

		const verification: FactoryCliGoalIterativeVerificationOutcome[] = [];
		for (const verificationCommand of input.verificationCommands.filter(
			(item) => item.required !== false,
		)) {
			const started = Date.now();
			const result = await runShellCommand(verificationCommand.command, input.signal);
			verification.push({
				command: verificationCommand.command,
				exitCode: result.exitCode,
				stdout: result.stdout,
				stderr: result.stderr,
				durationMs: Date.now() - started,
			});
		}

		iterations.push({
			iteration,
			codexExitCode: codexResult.exitCode,
			codexStdout: codexResult.stdout,
			codexStderr: codexResult.stderr,
			verification,
		});

		if (verification.every((item) => item.exitCode === 0)) {
			return {
				success: true,
				iterations,
				spawned: iterations.length + verification.length,
				cleaned: iterations.length + verification.length,
			};
		}

		prompt = [
			`Continue work order ${input.workOrderId}.`,
			"",
			"The previous iteration did not pass verification. Fix only the failing checks and stay inside allowed paths.",
			"",
			"## Verification output",
			"",
			...verification.map((item) =>
				[
					`### ${item.command}`,
					`Exit code: ${item.exitCode}`,
					"```text",
					[item.stdout, item.stderr].filter(Boolean).join("\n\n"),
					"```",
				].join("\n"),
			),
		].join("\n");
		useResume = true;
	}

	return {
		success: false,
		iterations,
		spawned: iterations.length,
		cleaned: iterations.length,
		failureReason: `max_iterations hit (${maxIterations})`,
	};
}

function goalIterativeCodexArgs(
	factoryRoot: string,
	allowedDirs: string[],
	resume: boolean,
): string[] {
	const common = [
		"-m",
		CODEX_MODEL,
		"-c",
		'model_reasoning_effort="xhigh"',
		"-c",
		'model_reasoning_summary="detailed"',
		"-c",
		'approval_policy="never"',
		"--full-auto",
		"--skip-git-repo-check",
	];
	if (resume) return ["exec", "resume", "--last", ...common, "-"];
	return [
		"exec",
		...common,
		"--sandbox",
		"workspace-write",
		"--cd",
		factoryRoot,
		...allowedDirs.flatMap((dir) => ["--add-dir", dir]),
		"-",
	];
}

function goalIterativeAllowedDirs(factoryRoot: string, allowedPaths: string[]): string[] {
	const dirs = new Set<string>();
	for (const allowedPath of allowedPaths) {
		const normalized = normalizeSlashes(allowedPath).replace(/^\.\//, "");
		const rootPart = normalized.replace(/[*?].*$/, "").replace(/\/+$/, "");
		const looksLikeFile = Boolean(path.extname(rootPart));
		const relativeDir = looksLikeFile ? path.dirname(rootPart) : rootPart || ".";
		dirs.add(path.resolve(factoryRoot, relativeDir === "." ? "" : relativeDir));
	}
	return [...dirs].sort();
}

function goalIterativePathBlock(allowedPaths: string[]): string | undefined {
	for (const allowedPath of allowedPaths) {
		const normalized = normalizeSlashes(allowedPath).replace(/^\.\//, "");
		if (/^projects\/_shared\/foundations(?:\/|$)/.test(normalized)) {
			return `foundation-class-block: ${allowedPath}`;
		}
		if (/^projects\/[^/]+\/foundations(?:\/|$)/.test(normalized)) {
			return `foundation-class-block: ${allowedPath}`;
		}
		if (/^work-orders(?:\/|$)/.test(normalized)) {
			return `work-order-path-block: ${allowedPath}`;
		}
		if (/^[^/]+\.ya?ml$/i.test(normalized) || /^projects\/[^/]+\.ya?ml$/i.test(normalized)) {
			return `project-yaml-block: ${allowedPath}`;
		}
	}
	return undefined;
}

function positiveInt(value: number | undefined, fallback: number): number {
	if (!Number.isFinite(value) || !value || value < 1) return fallback;
	return Math.floor(value);
}

function runShellCommand(command: string, signal?: AbortSignal): Promise<CommandResult> {
	if (process.platform === "win32") {
		return runCommand("powershell.exe", [
			"-NoProfile",
			"-ExecutionPolicy",
			"Bypass",
			"-Command",
			command,
		], { timeoutMs: INVOCATION_TIMEOUT_MS, signal });
	}
	return runCommand("bash", ["-lc", command], {
		timeoutMs: INVOCATION_TIMEOUT_MS,
		signal,
	});
}

export function providerForRole(roleId: string): FactoryCliProvider {
	if (roleId === "IMPLEMENTATION" || roleId === "DATA_AND_SECURITY_ARCHITECT") {
		return "codex";
	}
	return "claude";
}

export function isCliAuthOrNetworkError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	const failureKind = classifyFailure(message);
	return failureKind === "auth" || failureKind === "network";
}

export function classifyCliError(error: unknown): FactoryCliStatus["failureKind"] {
	const message = error instanceof Error ? error.message : String(error);
	return classifyFailure(message);
}
