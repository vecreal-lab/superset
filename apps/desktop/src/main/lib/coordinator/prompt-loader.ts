import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
	ArtifactReference,
	CoordinatorSurfaceContext,
	RightRailState,
} from "lib/types/factory-operator-console";
import type { CoordinatorDialogueTurn } from "./events";

export interface CoordinatorPromptBuildInput {
	projectId: string;
	operatorMessage: string;
	history: CoordinatorDialogueTurn[];
	rightRail: RightRailState;
	context: CoordinatorSurfaceContext;
	currentReferences: ArtifactReference[];
	recentActivity: Array<Record<string, unknown>>;
}

export interface CoordinatorPromptBundle {
	prompt: string;
	sources: string[];
	factoryRoot: string;
}

const PROMPT_PATH = "projects/software-factory/agent-prompts/PROJECT_COORDINATOR.md";
const REGISTRY_PATH = "projects/software-factory/role-catalog/registry.yml";
const ARCHITECTURE_PATH = "projects/software-factory/drafts/c26-architecture.md";
const SCREEN_BRIEF_PATH = "projects/software-factory/uiux/screens/project-coordinator.md";

function truncateForPrompt(content: string, max = 40_000): string {
	if (content.length <= max) return content;
	return `${content.slice(0, max)}\n\n[truncated at ${max} characters]`;
}

export function findFactoryRoot(): string {
	const explicit =
		process.env.SOFTWARE_FACTORY_ROOT || process.env.FACTORY_ROOT || "";
	const candidates = [
		explicit,
		process.cwd(),
		path.resolve(process.cwd(), ".."),
		path.resolve(process.cwd(), "..", ".."),
		path.resolve(process.cwd(), "..", "..", ".."),
		path.resolve(process.cwd(), "..", "..", "..", ".."),
	].filter(Boolean);

	for (const candidate of candidates) {
		let current = path.resolve(candidate);
		while (true) {
			if (
				existsSync(path.join(current, "work-orders")) &&
				existsSync(path.join(current, "projects", "software-factory"))
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

async function readOptionalFile(root: string, relativePath: string): Promise<string> {
	const resolved = path.resolve(root, relativePath);
	if (!resolved.startsWith(root) || !existsSync(resolved)) return "";
	return readFile(resolved, "utf8");
}

function formatHistory(history: CoordinatorDialogueTurn[]): string {
	if (!history.length) return "No prior Project Coordinator turns.";
	return history
		.slice(-12)
		.map((turn) => {
			const author = turn.author.displayName || turn.author.user;
			return `[${turn.role}] ${author}: ${turn.text}`;
		})
		.join("\n\n");
}

export async function buildProjectCoordinatorPrompt(
	input: CoordinatorPromptBuildInput,
): Promise<CoordinatorPromptBundle> {
	const root = findFactoryRoot();
	const [rolePrompt, registry, architecture, screenBrief] = await Promise.all([
		readOptionalFile(root, PROMPT_PATH),
		readOptionalFile(root, REGISTRY_PATH),
		readOptionalFile(root, ARCHITECTURE_PATH),
		readOptionalFile(root, SCREEN_BRIEF_PATH),
	]);

	const sources = [PROMPT_PATH, REGISTRY_PATH, ARCHITECTURE_PATH, SCREEN_BRIEF_PATH];
	const prompt = [
		"You are PROJECT_COORDINATOR inside the Software Factory cockpit.",
		"Speak to Yuriy in plain English. Keep raw paths, stack traces, provider logs, and low-level tool output out of chat unless he asks.",
		"High-stakes operations must propose a GateCard for operator approval before anything changes.",
		"Emit normal markdown prose only. Tool proposals are handled by the coordinator runtime, not by JSON in the chat text.",
		"",
		"## Project-Local Role Prompt",
		truncateForPrompt(rolePrompt || "PROJECT_COORDINATOR project-local prompt missing.", 45_000),
		"",
		"## Project-Local Role Registry",
		truncateForPrompt(registry || "Project-local role registry missing.", 20_000),
		"",
		"## C26 Coordinator Architecture Excerpt",
		truncateForPrompt(architecture, 45_000),
		"",
		"## Stage C Project Coordinator Brief",
		truncateForPrompt(screenBrief, 35_000),
		"",
		"## Active Project",
		input.projectId,
		"",
		"## Coordinator Context",
		JSON.stringify(input.context, null, 2),
		"",
		"## Current Right Rail",
		JSON.stringify(input.rightRail, null, 2),
		"",
		"## Current References",
		JSON.stringify(input.currentReferences, null, 2),
		"",
		"## Recent Activity",
		JSON.stringify(input.recentActivity.slice(0, 12), null, 2),
		"",
		"## Recent Coordinator History",
		formatHistory(input.history),
		"",
		"## Yuriy's Latest Message",
		input.operatorMessage,
	].join("\n");

	return { prompt, sources, factoryRoot: root };
}
