import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
	appendFile,
	mkdir,
	readdir,
	readFile,
	stat,
	writeFile,
} from "node:fs/promises";
import path from "node:path";

export const DIALOGUE_STATES = [
	"needs_reply",
	"awaiting_commit",
	"awaiting_confirmation",
	"agent_thinking",
	"idle_exploratory",
	"shelved",
	"cascade_pending",
	"abandoned",
	"committed_resolved",
] as const;

export type DialogueState = (typeof DIALOGUE_STATES)[number];

export type DialogueMessageKind = "operator" | "agent" | "specialist" | "system";

export const DEFAULT_DIALOGUE_PROJECT_ID = "software-factory";

export interface DialogueMessage {
	id: string;
	dialogue_id: string;
	kind: DialogueMessageKind;
	speaker: string;
	role_id?: string;
	content: string;
	created_at: string;
}

interface DialogueMetadata {
	id: string;
	project: string;
	surface: string;
	title: string;
	created_at: string;
	updated_at: string;
	archived: boolean;
}

interface DialogueStateFile {
	state: DialogueState;
	updated_at: string;
	last_activity_at: string;
}

export interface DialogueRecord extends DialogueMetadata, DialogueStateFile {
	source_path: string;
	source_relative_path: string;
	messages_path: string;
	message_count: number;
	last_message_preview: string;
}

export interface DialogueTurnResult {
	dialogue: DialogueRecord;
	messages: DialogueMessage[];
	agent_message: DialogueMessage;
}

export interface DialogueAttentionCounts {
	total: number;
	by_project: Record<string, number>;
	by_surface: Record<string, number>;
	by_state: Partial<Record<DialogueState, number>>;
	items: DialogueRecord[];
}

const HIGH_ATTENTION_STATES = new Set<DialogueState>([
	"needs_reply",
	"awaiting_commit",
	"awaiting_confirmation",
]);

const SURFACE_PRIMARY_AGENTS: Record<string, string> = {
	home: "ORCH",
	mission: "DOMAIN_KNOWLEDGE_STEWARD",
	foundations: "DOMAIN_KNOWLEDGE_STEWARD",
	"work-orders": "ORCH",
	approvals: "AUDIT",
	"strategy-pulse": "STRATEGY_STEWARD",
	roles: "AGENT_ARCHITECT",
	"build-vs-compose": "LANDSCAPE_ANALYST",
	decisions: "STRATEGY_STEWARD",
	lessons: "KNOWLEDGE_LIBRARIAN",
	projects: "PROJECT_HEALTH_MONITOR",
	dialogues: "ORCH",
};

function normalizeSlashes(value: string): string {
	return value.replace(/\\/g, "/");
}

function isInsidePath(parent: string, candidate: string): boolean {
	const relative = path.relative(parent, candidate);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function findFactoryRoot(): string {
	const explicit =
		process.env.SOFTWARE_FACTORY_ROOT || process.env.FACTORY_ROOT || "";
	const startCandidates = [
		explicit,
		process.cwd(),
		path.resolve(process.cwd(), ".."),
		path.resolve(process.cwd(), "..", ".."),
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

function safeSegment(value: string): string {
	const normalized = value.trim().replace(/[^A-Za-z0-9._-]+/g, "-");
	return normalized || "surface";
}

function surfaceSegments(surface: string): string[] {
	return normalizeSlashes(surface)
		.split("/")
		.map(safeSegment)
		.filter(Boolean);
}

function projectSegment(project?: string): string {
	const rawProject = project?.trim() || DEFAULT_DIALOGUE_PROJECT_ID;
	if (
		rawProject.includes("/") ||
		rawProject.includes("\\") ||
		rawProject === "." ||
		rawProject === ".." ||
		rawProject.includes("..")
	) {
		throw new Error(`Dialogue project must be a safe project id: ${rawProject}`);
	}
	return safeSegment(rawProject);
}

function stringifyYaml(entries: Array<readonly [string, string | boolean]>): string {
	return `${entries
		.map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
		.join("\n")}\n`;
}

function parseYamlScalar(value: string): string | boolean {
	const trimmed = value.trim();
	if (trimmed === "true") return true;
	if (trimmed === "false") return false;
	try {
		const parsed = JSON.parse(trimmed) as unknown;
		if (typeof parsed === "string" || typeof parsed === "boolean") return parsed;
	} catch {
		// Fall back to unquoted scalar below.
	}
	return trimmed;
}

function parseYamlRecord(raw: string): Record<string, string | boolean> {
	const parsed: Record<string, string | boolean> = {};
	for (const line of raw.split(/\r?\n/)) {
		const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
		if (!match) continue;
		const [, key, value] = match;
		if (!key) continue;
		parsed[key] = parseYamlScalar(value || "");
	}
	return parsed;
}

function nowIso(): string {
	return new Date().toISOString();
}

function previewMessage(messages: DialogueMessage[]): string {
	const last = messages.at(-1);
	if (!last) return "";
	return last.content.length > 140 ? `${last.content.slice(0, 137)}...` : last.content;
}

function surfaceLabel(surface: string): string {
	return surface.replace(/[-_/]+/g, " ");
}

function surfacePrimaryAgent(surface: string): string {
	const normalized = surfaceSegments(surface).at(0) || "home";
	return SURFACE_PRIMARY_AGENTS[normalized] || "ORCH";
}

function operatorSurfaceKey(surface: string): string | null {
	const normalized = surfaceSegments(surface).at(0);
	return normalized && SURFACE_PRIMARY_AGENTS[normalized] ? normalized : null;
}

function isAmbiguousCommitPhrase(normalized: string): boolean {
	return /^(sounds good|ok|okay|yeah|yep|sure|looks good)\.?$/.test(normalized);
}

function isConcreteCommitPhrase(normalized: string): boolean {
	return /\b(approved|approve|confirm|confirmed|ship it|do it|go|commit)\b/.test(
		normalized,
	);
}

function isChangeProposal(normalized: string): boolean {
	return /\b(change|edit|update|rewrite|replace|revise)\b/.test(normalized);
}

function inferNextState(message: string, previousState?: DialogueState): DialogueState {
	const normalized = message.trim().toLowerCase();
	if (isAmbiguousCommitPhrase(normalized)) {
		return "awaiting_confirmation";
	}
	if (isConcreteCommitPhrase(normalized)) {
		return previousState === "awaiting_commit"
			? "awaiting_commit"
			: "awaiting_confirmation";
	}
	if (isChangeProposal(normalized)) {
		return "awaiting_commit";
	}
	return "needs_reply";
}

function dialogueStewardResponse(input: {
	project: string;
	surface: string;
	message: string;
	state: DialogueState;
	previousState?: DialogueState;
}): string {
	const target = surfaceLabel(input.surface);
	const primaryAgent = surfacePrimaryAgent(input.surface);
	const normalized = input.message.trim().toLowerCase();
	const lead = `DIALOGUE_STEWARD is coordinating this ${target} turn for project ${input.project}. ${primaryAgent} remains the surface-specific primary role; I am not replacing that specialist.`;

	if (input.state === "awaiting_confirmation") {
		return `${lead}\n\nI am treating this as not clear enough to commit yet. Restate-and-ask: do you want me to change the ${target} source, or were you confirming the direction conversationally? Reply with the exact change or an explicit approval after the proposal is clear.`;
	}
	if (
		input.state === "awaiting_commit" &&
		isConcreteCommitPhrase(normalized) &&
		input.previousState === "awaiting_commit"
	) {
		return `${lead}\n\nConcrete approval received after a clear proposal. I am ready for the commit action; when you commit, I will preserve the audit trail and surface cascade links to /factory/work-orders and /factory/approvals.`;
	}
	if (input.state === "awaiting_commit") {
		return `${lead}\n\nI read this as a proposed change. Impact review before commit: read the ${target} source artifact, related foundations, open work orders, and recent decisions; then ask ${primaryAgent} for surface judgment and AUDIT for criteria risk if the proposal changes accepted behavior. No write has happened yet.`;
	}
	return `${lead}\n\nI am treating this as exploration or Q&A. I will answer from the living document, cite the nearest source artifacts, call out downstream impact, and only move toward commit after a specific proposal is stated.`;
}

export class FactoryDialogueStore {
	private root: string;
	private dialoguesRoot: string;

	constructor(root = findFactoryRoot()) {
		this.root = root;
		this.dialoguesRoot = path.join(root, "runs", "dialogues");
	}

	private resolveInsideDialogues(relativeOrAbsolutePath: string): string {
		const resolved = path.resolve(this.root, relativeOrAbsolutePath);
		if (!isInsidePath(this.dialoguesRoot, resolved)) {
			throw new Error(`Dialogue path must stay inside runs/dialogues/: ${relativeOrAbsolutePath}`);
		}
		return resolved;
	}

	private dialogueDir(project: string | undefined, surface: string, dialogueId: string): string {
		const segments = surfaceSegments(surface);
		return this.resolveInsideDialogues(
			path.join(
				"runs",
				"dialogues",
				projectSegment(project),
				...segments,
				safeSegment(dialogueId),
			),
		);
	}

	private async ensureDialogueDir(
		project: string | undefined,
		surface: string,
		dialogueId: string,
	): Promise<string> {
		const directory = this.dialogueDir(project, surface, dialogueId);
		await mkdir(directory, { recursive: true });
		return directory;
	}

	private async writeMetadata(directory: string, metadata: DialogueMetadata): Promise<void> {
		await writeFile(
			path.join(directory, "metadata.yml"),
			stringifyYaml(Object.entries(metadata)),
			"utf8",
		);
	}

	private async writeState(directory: string, state: DialogueStateFile): Promise<void> {
		await writeFile(
			path.join(directory, "state.yml"),
			stringifyYaml(Object.entries(state)),
			"utf8",
		);
	}

	private async appendMessage(directory: string, message: DialogueMessage): Promise<void> {
		await appendFile(path.join(directory, "messages.jsonl"), `${JSON.stringify(message)}\n`, "utf8");
	}

	private async appendAudit(
		directory: string,
		event: string,
		details: Record<string, string | boolean>,
	): Promise<void> {
		await appendFile(
			path.join(directory, "audit.jsonl"),
			`${JSON.stringify({ id: randomUUID(), event, created_at: nowIso(), ...details })}\n`,
			"utf8",
		);
	}

	private async readMessages(directory: string): Promise<DialogueMessage[]> {
		const messagesPath = path.join(directory, "messages.jsonl");
		if (!existsSync(messagesPath)) return [];
		const raw = await readFile(messagesPath, "utf8");
		return raw
			.split(/\r?\n/)
			.filter(Boolean)
			.map((line) => JSON.parse(line) as DialogueMessage);
	}

	private async readDialogue(directory: string): Promise<DialogueRecord | null> {
		const metadataPath = path.join(directory, "metadata.yml");
		const statePath = path.join(directory, "state.yml");
		if (!existsSync(metadataPath) || !existsSync(statePath)) return null;

		const metadataRaw = parseYamlRecord(await readFile(metadataPath, "utf8"));
		const stateRaw = parseYamlRecord(await readFile(statePath, "utf8"));
		const messages = await this.readMessages(directory);
		const modifiedAt = (await stat(statePath)).mtime.toISOString();
		const state = String(stateRaw.state || "idle_exploratory") as DialogueState;
		const relativeParts = normalizeSlashes(path.relative(this.dialoguesRoot, directory))
			.split("/")
			.filter(Boolean);
		const project = String(
			metadataRaw.project || relativeParts[0] || DEFAULT_DIALOGUE_PROJECT_ID,
		);
		return {
			id: String(metadataRaw.id || path.basename(directory)),
			project,
			surface: String(metadataRaw.surface || "unknown"),
			title: String(metadataRaw.title || "Untitled dialogue"),
			created_at: String(metadataRaw.created_at || modifiedAt),
			updated_at: String(metadataRaw.updated_at || modifiedAt),
			archived: Boolean(metadataRaw.archived),
			state,
			last_activity_at: String(stateRaw.last_activity_at || modifiedAt),
			source_path: directory,
			source_relative_path: normalizeSlashes(path.relative(this.root, directory)),
			messages_path: normalizeSlashes(path.relative(this.root, path.join(directory, "messages.jsonl"))),
			message_count: messages.length,
			last_message_preview: previewMessage(messages),
		};
	}

	private async updateDialogueState(
		project: string | undefined,
		surface: string,
		dialogueId: string,
		state: DialogueState,
		options: { archived?: boolean; auditEvent?: string } = {},
	): Promise<DialogueRecord> {
		const directory = this.dialogueDir(project, surface, dialogueId);
		const existing = await this.readDialogue(directory);
		if (!existing) {
			throw new Error(
				`Dialogue not found: ${projectSegment(project)}/${surface}/${dialogueId}`,
			);
		}
		const timestamp = nowIso();
		const metadata: DialogueMetadata = {
			id: existing.id,
			project: existing.project,
			surface: existing.surface,
			title: existing.title,
			created_at: existing.created_at,
			updated_at: timestamp,
			archived: options.archived ?? existing.archived,
		};
		await this.writeMetadata(directory, metadata);
		await this.writeState(directory, {
			state,
			updated_at: timestamp,
			last_activity_at: timestamp,
		});
		if (options.auditEvent) {
			await this.appendAudit(directory, options.auditEvent, {
				state,
				archived: metadata.archived,
			});
		}
		const next = await this.readDialogue(directory);
		if (!next) throw new Error(`Dialogue vanished after update: ${surface}/${dialogueId}`);
		return next;
	}

	async startTurn(input: {
		project?: string;
		surface: string;
		message: string;
		title?: string;
	}): Promise<DialogueTurnResult> {
		const dialogueId = randomUUID();
		const project = projectSegment(input.project);
		const directory = await this.ensureDialogueDir(project, input.surface, dialogueId);
		const timestamp = nowIso();
		const state = inferNextState(input.message);
		const metadata: DialogueMetadata = {
			id: dialogueId,
			project,
			surface: input.surface,
			title: input.title || `Dialogue on ${input.surface}`,
			created_at: timestamp,
			updated_at: timestamp,
			archived: false,
		};
		await this.writeMetadata(directory, metadata);
		await this.writeState(directory, {
			state,
			updated_at: timestamp,
			last_activity_at: timestamp,
		});
		const operatorMessage: DialogueMessage = {
			id: randomUUID(),
			dialogue_id: dialogueId,
			kind: "operator",
			speaker: "Yuriy",
			content: input.message,
			created_at: timestamp,
		};
		const agentMessage: DialogueMessage = {
			id: randomUUID(),
			dialogue_id: dialogueId,
			kind: "agent",
			speaker: "DIALOGUE_STEWARD",
			role_id: "DIALOGUE_STEWARD",
			content: dialogueStewardResponse({
				project,
				surface: input.surface,
				message: input.message,
				state,
			}),
			created_at: nowIso(),
		};
		await this.appendMessage(directory, operatorMessage);
		await this.appendMessage(directory, agentMessage);
		await this.appendAudit(directory, "dialogue_started", {
			project,
			state,
			surface: input.surface,
		});
		const dialogue = await this.readDialogue(directory);
		if (!dialogue) throw new Error("Failed to read newly-created dialogue");
		return { dialogue, messages: [operatorMessage, agentMessage], agent_message: agentMessage };
	}

	async continueTurn(input: {
		project?: string;
		surface: string;
		dialogueId: string;
		message: string;
	}): Promise<DialogueTurnResult> {
		const project = projectSegment(input.project);
		const directory = this.dialogueDir(project, input.surface, input.dialogueId);
		const existing = await this.readDialogue(directory);
		if (!existing) {
			throw new Error(
				`Dialogue not found: ${project}/${input.surface}/${input.dialogueId}`,
			);
		}
		const state = inferNextState(input.message, existing.state);
		const timestamp = nowIso();
		const operatorMessage: DialogueMessage = {
			id: randomUUID(),
			dialogue_id: input.dialogueId,
			kind: "operator",
			speaker: "Yuriy",
			content: input.message,
			created_at: timestamp,
		};
		const agentMessage: DialogueMessage = {
			id: randomUUID(),
			dialogue_id: input.dialogueId,
			kind: "agent",
			speaker: "DIALOGUE_STEWARD",
			role_id: "DIALOGUE_STEWARD",
			content: dialogueStewardResponse({
				project,
				surface: input.surface,
				message: input.message,
				state,
				previousState: existing.state,
			}),
			created_at: nowIso(),
		};
		await this.appendMessage(directory, operatorMessage);
		await this.appendMessage(directory, agentMessage);
		await this.updateDialogueState(project, input.surface, input.dialogueId, state);
		const dialogue = await this.readDialogue(directory);
		if (!dialogue) throw new Error("Failed to read updated dialogue");
		const messages = await this.readMessages(directory);
		return { dialogue, messages, agent_message: agentMessage };
	}

	async commit(input: {
		project?: string;
		surface: string;
		dialogueId: string;
		notes?: string;
	}): Promise<DialogueRecord> {
		const project = projectSegment(input.project);
		const directory = this.dialogueDir(project, input.surface, input.dialogueId);
		const cascadeId = `WO-LDP-CASCADE-${input.dialogueId.slice(0, 8).toUpperCase()}`;
		await this.appendAudit(directory, "commit_requested", {
			project,
			notes: input.notes || "",
			dialogue_steward_bridge: true,
			cascade_work_order: `/factory/work-orders/${cascadeId}`,
			approval_queue: "/factory/approvals",
		});
		await this.appendMessage(directory, {
			id: randomUUID(),
			dialogue_id: input.dialogueId,
			kind: "agent",
			speaker: "DIALOGUE_STEWARD",
			role_id: "DIALOGUE_STEWARD",
			content: `Commit recorded. Cascade draft links: [${cascadeId}](/factory/work-orders/${cascadeId}) and [Approval Queue](/factory/approvals). The next implementation work order must cite this dialogue before writing.`,
			created_at: nowIso(),
		});
		return this.updateDialogueState(project, input.surface, input.dialogueId, "cascade_pending", {
			auditEvent: "commit_recorded",
		});
	}

	async abandon(
		project: string | undefined,
		surface: string,
		dialogueId: string,
	): Promise<DialogueRecord> {
		return this.updateDialogueState(project, surface, dialogueId, "abandoned", {
			archived: true,
			auditEvent: "dialogue_abandoned",
		});
	}

	async shelve(
		project: string | undefined,
		surface: string,
		dialogueId: string,
	): Promise<DialogueRecord> {
		return this.updateDialogueState(project, surface, dialogueId, "shelved", {
			auditEvent: "dialogue_shelved",
		});
	}

	async unshelve(
		project: string | undefined,
		surface: string,
		dialogueId: string,
	): Promise<DialogueRecord> {
		return this.updateDialogueState(project, surface, dialogueId, "idle_exploratory", {
			auditEvent: "dialogue_unshelved",
		});
	}

	async archive(
		project: string | undefined,
		surface: string,
		dialogueId: string,
	): Promise<DialogueRecord> {
		const current = await this.readDialogue(this.dialogueDir(project, surface, dialogueId));
		return this.updateDialogueState(project, surface, dialogueId, current?.state || "abandoned", {
			archived: true,
			auditEvent: "dialogue_archived",
		});
	}

	async resume(
		project: string | undefined,
		surface: string,
		dialogueId: string,
	): Promise<DialogueRecord> {
		return this.updateDialogueState(project, surface, dialogueId, "needs_reply", {
			archived: false,
			auditEvent: "dialogue_resumed",
		});
	}

	private async walkDialogueDirs(directory = this.dialoguesRoot): Promise<string[]> {
		if (!existsSync(directory)) return [];
		const entries = await readdir(directory, { withFileTypes: true });
		const directories: string[] = [];
		if (entries.some((entry) => entry.isFile() && entry.name === "metadata.yml")) {
			return [directory];
		}
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			directories.push(...(await this.walkDialogueDirs(path.join(directory, entry.name))));
		}
		return directories;
	}

	async list(input: {
		project?: string;
		surface?: string;
		states?: DialogueState[];
		includeArchived?: boolean;
	} = {}): Promise<DialogueRecord[]> {
		const directories = await this.walkDialogueDirs();
		const records = (
			await Promise.all(directories.map((directory) => this.readDialogue(directory)))
		).filter((record): record is DialogueRecord => Boolean(record));
		const stateFilter = new Set(input.states || []);
		const project = projectSegment(input.project);
		return records
			.filter((record) => record.project === project)
			.filter((record) => (input.surface ? record.surface === input.surface : true))
			.filter((record) => (stateFilter.size ? stateFilter.has(record.state) : true))
			.filter((record) => input.includeArchived || !record.archived)
			.sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at));
	}

	async attentionCounts(input: {
		project?: string;
		surface?: string;
	} = {}): Promise<DialogueAttentionCounts> {
		const items = (
			await this.list({ project: input.project, surface: input.surface })
		).filter(
			(record) =>
				HIGH_ATTENTION_STATES.has(record.state) && operatorSurfaceKey(record.surface),
		);
		const by_project: Record<string, number> = {};
		const by_surface: Record<string, number> = {};
		const by_state: Partial<Record<DialogueState, number>> = {};
		for (const item of items) {
			const surface = operatorSurfaceKey(item.surface);
			if (!surface) continue;
			by_project[item.project] = (by_project[item.project] || 0) + 1;
			by_surface[surface] = (by_surface[surface] || 0) + 1;
			by_state[item.state] = (by_state[item.state] || 0) + 1;
		}
		return {
			total: items.length,
			by_project,
			by_surface,
			by_state,
			items,
		};
	}
}

let singleton: FactoryDialogueStore | null = null;

export function getFactoryDialogueStore(): FactoryDialogueStore {
	singleton ??= new FactoryDialogueStore();
	return singleton;
}
