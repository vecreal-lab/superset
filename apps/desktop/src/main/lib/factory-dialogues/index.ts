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
import {
	DEFAULT_FOUNDATION_OWNER_IDENTITY,
	type FoundationClassAuditPolicyInput,
	type FoundationClassAuditPolicyResult,
	type FoundationOwnerPolicy,
	applyFoundationLockDate,
	evaluateFoundationClassAuditPolicy,
	getFoundationClassPathInfo,
	isFoundationClassPath,
	isFoundationClassSurface,
	isFoundationOwner,
	normalizeOperatorIdentity,
} from "shared/factory-foundation-class";
import { isChangeProposalIntent } from "shared/factory-dialogue-intent";
import { buildUnifiedTextDiff } from "shared/factory-visual-diff";
import type {
	AuthorAttribution,
	StaleStateNotice,
} from "lib/types/factory-operator-console";

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
export const DEFAULT_CURRENT_OPERATOR_ID = "yuriy";
const DEFAULT_CURRENT_OPERATOR_DISPLAY_NAME = "Yuriy";

export type DialogueParticipant = AuthorAttribution;

export type DialogueAuthorAttribution = AuthorAttribution;

export interface DialogueMessage {
	id: string;
	dialogue_id: string;
	kind: DialogueMessageKind;
	speaker: string;
	author_id?: string;
	role_id?: string;
	author?: DialogueAuthorAttribution;
	content: string;
	created_at: string;
}

interface DialogueMetadata {
	id: string;
	project: string;
	surface: string;
	title: string;
	author?: string;
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
	primary_agent: string;
	participants: AuthorAttribution[];
	assigned_operator_id?: string;
	is_mine: boolean;
	stale_state_notice?: StaleStateNotice;
}

export interface DialogueTurnResult {
	dialogue: DialogueRecord;
	messages: DialogueMessage[];
	agent_message: DialogueMessage;
}

export interface DialogueBeginTurnResult {
	dialogue: DialogueRecord;
	messages: DialogueMessage[];
	operator_message: DialogueMessage;
	state: DialogueState;
	previousState?: DialogueState;
}

export interface DialogueReadResult {
	dialogue: DialogueRecord;
	messages: DialogueMessage[];
}

export interface DialogueCommitInput {
	project?: string;
	surface: string;
	dialogueId: string;
	notes?: string;
	operatorName?: string;
	operatorReason?: string;
	visualDiffConfirmed?: boolean;
	documentPath?: string;
	documentBefore?: string;
	documentAfter?: string;
}

export interface DialogueCascadeDraft {
	id: string;
	title: string;
	href: string;
	status: string;
	summary?: string;
	source_path?: string;
}

interface FoundationReviewScope {
	foundationsFolder: string;
	foundationFiles: string[];
	citingDocs: string[];
}

interface DocumentCommitResult {
	foundationClass: boolean;
	documentPath: string;
	diff: string;
	reviewScope?: FoundationReviewScope;
	cascadeDrafts: DialogueCascadeDraft[];
}

export interface DialogueAttentionCounts {
	total: number;
	by_project: Record<string, number>;
	by_surface: Record<string, number>;
	by_state: Partial<Record<DialogueState, number>>;
	items: DialogueRecord[];
	operator_id: string;
	workspace_id: string;
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
	intake: "INTAKE_STEWARD",
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

function stripYamlString(value: string): string {
	const withoutComment = value.replace(/\s+#.*$/, "").trim();
	if (
		(withoutComment.startsWith('"') && withoutComment.endsWith('"')) ||
		(withoutComment.startsWith("'") && withoutComment.endsWith("'"))
	) {
		return withoutComment.slice(1, -1).trim();
	}
	return withoutComment;
}

function parseYamlStringList(raw: string, key: string): string[] {
	const lines = raw.split(/\r?\n/);
	const values: string[] = [];
	let inList = false;

	for (const line of lines) {
		const scalar = new RegExp(`^${key}:\\s*(.*)$`).exec(line);
		if (scalar) {
			const value = stripYamlString(scalar[1] || "");
			if (value.startsWith("[") && value.endsWith("]")) {
				return value
					.slice(1, -1)
					.split(",")
					.map(stripYamlString)
					.filter(Boolean);
			}
			if (value) return [value];
			inList = true;
			continue;
		}

		if (inList) {
			const item = /^\s*-\s*(.+)$/.exec(line);
			if (item) {
				const value = stripYamlString(item[1] || "");
				if (value) values.push(value);
				continue;
			}
			if (/^\S/.test(line)) break;
		}
	}

	return values;
}

function nowIso(): string {
	return new Date().toISOString();
}

function humanAuthor(operatorName = DEFAULT_FOUNDATION_OWNER_IDENTITY): DialogueAuthorAttribution {
	const user = normalizeOperatorIdentity(operatorName) || DEFAULT_FOUNDATION_OWNER_IDENTITY;
	return {
		user,
		isAgent: false,
		displayName: user,
	};
}

function operatorAuthor(): DialogueAuthorAttribution {
	return {
		user: DEFAULT_CURRENT_OPERATOR_ID,
		isAgent: false,
		displayName: DEFAULT_CURRENT_OPERATOR_DISPLAY_NAME,
	};
}

function roleAuthor(speaker: string, roleId?: string): DialogueAuthorAttribution {
	const role = roleId || speaker;
	return {
		user: normalizeOperatorIdentity(role),
		role,
		isAgent: true,
		displayName: speaker,
	};
}

function previewMessage(messages: DialogueMessage[]): string {
	const last = messages.at(-1);
	if (!last) return "";
	return last.content.length > 140 ? `${last.content.slice(0, 137)}...` : last.content;
}

function authorFromMessage(message: DialogueMessage): AuthorAttribution {
	const storedAuthor = message.author as AuthorAttribution | string | undefined;
	if (storedAuthor && typeof storedAuthor === "object") {
		return {
			...storedAuthor,
			role: storedAuthor.role || message.role_id,
			displayName: storedAuthor.displayName || message.speaker,
		};
	}
	const isAgent = message.kind !== "operator";
	const role = message.role_id || (isAgent ? message.speaker : undefined);
	const authorId =
		message.author_id ||
		(typeof storedAuthor === "string" ? storedAuthor : undefined) ||
		(isAgent ? "agent" : DEFAULT_CURRENT_OPERATOR_ID);
	return {
		user: authorId,
		role,
		isAgent,
		displayName:
			isAgent ? role || message.speaker : message.speaker || DEFAULT_CURRENT_OPERATOR_DISPLAY_NAME,
	};
}

function uniqueParticipants(messages: DialogueMessage[]): AuthorAttribution[] {
	const participants = new Map<string, AuthorAttribution>();
	for (const message of messages) {
		const attribution = authorFromMessage(message);
		const key = `${attribution.isAgent ? "agent" : "operator"}:${attribution.user}:${attribution.role || ""}`;
		participants.set(key, attribution);
	}
	if (participants.size === 0) {
		participants.set("operator:yuriy:", {
			user: "yuriy",
			isAgent: false,
			displayName: "Yuriy",
		});
	}
	return [...participants.values()];
}

function staleStateNoticeFromState(
	stateRaw: Record<string, string | boolean>,
): StaleStateNotice | undefined {
	const summary = stateRaw.stale_summary;
	const sourcePath = stateRaw.stale_source_path;
	if (typeof summary !== "string" || typeof sourcePath !== "string") {
		return undefined;
	}
	return {
		sourcePath,
		summary,
		previousUpdatedAt:
			typeof stateRaw.stale_previous_updated_at === "string"
				? stateRaw.stale_previous_updated_at
				: undefined,
		currentUpdatedAt:
			typeof stateRaw.stale_current_updated_at === "string"
				? stateRaw.stale_current_updated_at
				: undefined,
		acknowledged: Boolean(stateRaw.stale_acknowledged),
	};
}

function surfaceLabel(surface: string): string {
	return surface.replace(/[-_/]+/g, " ");
}

function surfacePrimaryAgent(surface: string): string {
	const normalized = surfaceSegments(surface).at(0) || "home";
	return SURFACE_PRIMARY_AGENTS[normalized] || "ORCH";
}

function operatorParticipant(
	operatorId = DEFAULT_CURRENT_OPERATOR_ID,
): DialogueParticipant {
	return {
		user: operatorId,
		isAgent: false,
		displayName:
			operatorId === DEFAULT_CURRENT_OPERATOR_ID
				? DEFAULT_CURRENT_OPERATOR_DISPLAY_NAME
				: operatorId,
	};
}

function agentParticipant(roleId: string): DialogueParticipant {
	return {
		user: roleId.toLowerCase(),
		role: roleId,
		isAgent: true,
		displayName: roleId,
	};
}

function surfaceImpactSpecialist(surface: string): string | null {
	const normalized = surfaceSegments(surface).at(0) || "home";
	if (normalized === "mission" || normalized === "foundations") {
		return "STRATEGY_STEWARD";
	}
	if (normalized === "work-orders") {
		return "PRODUCT_SCOPE";
	}
	if (normalized === "build-vs-compose") {
		return "STRATEGY_STEWARD";
	}
	return null;
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

function inferNextState(message: string, previousState?: DialogueState): DialogueState {
	const normalized = message.trim().toLowerCase();
	if (isAmbiguousCommitPhrase(normalized)) {
		return "awaiting_confirmation";
	}
	if (isConcreteCommitPhrase(normalized)) {
		return previousState === "awaiting_commit" ||
			previousState === "awaiting_confirmation"
			? "awaiting_commit"
			: "awaiting_confirmation";
	}
	if (isChangeProposalIntent(normalized)) {
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
	const impactSpecialist = surfaceImpactSpecialist(input.surface);
	const impactLine = impactSpecialist
		? ` ${impactSpecialist} handles impact analysis before downstream work is spawned.`
		: "";
	const foundationLine = isFoundationClassSurface(input.surface)
		? " This is a foundation-class surface: the project owner from project-pipeline.yml must approve the write, holistic review includes the full foundations folder plus citing docs, and every non-trivial citation impact needs a cascade draft."
		: "";
	const normalized = input.message.trim().toLowerCase();
	const lead = `DIALOGUE_STEWARD is coordinating this ${target} turn for project ${input.project}. ${primaryAgent} remains the surface-specific primary role; I am not replacing that specialist.${impactLine}${foundationLine}`;

	if (input.state === "awaiting_confirmation") {
		return `${lead}\n\nI am treating this as not clear enough to commit yet. Restate-and-ask: do you want me to change the ${target} source, or were you confirming the direction conversationally? Reply with the exact change or an explicit approval after the proposal is clear.`;
	}
	if (
		input.state === "awaiting_commit" &&
		isConcreteCommitPhrase(normalized) &&
		(input.previousState === "awaiting_commit" ||
			input.previousState === "awaiting_confirmation")
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

	getFactoryRoot(): string {
		return this.root;
	}

	getPrimaryAgent(surface: string): string {
		return surfacePrimaryAgent(surface);
	}

	getImpactSpecialist(surface: string): string | null {
		return surfaceImpactSpecialist(surface);
	}

	private projectPipelinePath(projectId: string): string {
		return path.join(this.root, "projects", ...projectId.split("/"), "project-pipeline.yml");
	}

	private sharedOwnersPath(): string {
		return path.join(this.root, "projects", "_shared", "owners.yml");
	}

	private async ensureSharedOwnersFile(): Promise<string> {
		const ownersPath = this.sharedOwnersPath();
		if (!existsSync(ownersPath)) {
			await mkdir(path.dirname(ownersPath), { recursive: true });
			await writeFile(
				ownersPath,
				[
					"# Shared foundation owners",
					"# Created by WO-C15.8 as the v0 owner policy source for projects/_shared/foundations/**.",
					"foundation_shared_owners:",
					`  - ${DEFAULT_FOUNDATION_OWNER_IDENTITY}`,
					"",
				].join("\n"),
				"utf8",
			);
		}
		return ownersPath;
	}

	async getFoundationOwnerPolicy(documentPath: string): Promise<FoundationOwnerPolicy> {
		const normalizedPath = normalizeSlashes(documentPath);
		const info = getFoundationClassPathInfo(normalizedPath);
		if (!info) {
			throw new Error(`Owner policy only applies to foundation-class paths: ${documentPath}`);
		}

		if (info.isShared) {
			const ownersPath = await this.ensureSharedOwnersFile();
			const ownersRaw = await readFile(ownersPath, "utf8");
			const owners = parseYamlStringList(ownersRaw, "foundation_shared_owners");
			const authorizedOwners = owners.length
				? owners.map(normalizeOperatorIdentity).filter(Boolean)
				: [DEFAULT_FOUNDATION_OWNER_IDENTITY];
			return {
				documentPath: info.relativePath,
				projectId: info.projectId,
				isShared: true,
				ownershipScope: "shared",
				requiredOwner: authorizedOwners[0] || DEFAULT_FOUNDATION_OWNER_IDENTITY,
				authorizedOwners,
				ownerLabel: "shared (admins)",
				ownerSourcePath: this.relativeToRoot(ownersPath),
			};
		}

		const pipelinePath = this.projectPipelinePath(info.projectId);
		if (!existsSync(pipelinePath)) {
			throw new Error(
				`Project pipeline not found for foundation owner policy: ${this.relativeToRoot(pipelinePath)}`,
			);
		}
		const pipelineRaw = parseYamlRecord(await readFile(pipelinePath, "utf8"));
		const primaryOwner = String(pipelineRaw.primary_owner || "").trim();
		if (!primaryOwner) {
			throw new Error(
				`Project pipeline must declare primary_owner before foundation-class commits: ${this.relativeToRoot(pipelinePath)}`,
			);
		}
		const owner = normalizeOperatorIdentity(primaryOwner);
		return {
			documentPath: info.relativePath,
			projectId: info.projectId,
			isShared: false,
			ownershipScope: "project",
			requiredOwner: owner,
			authorizedOwners: [owner],
			ownerLabel: owner,
			ownerSourcePath: this.relativeToRoot(pipelinePath),
		};
	}

	async evaluateFoundationAuditPolicy(
		input: Omit<FoundationClassAuditPolicyInput, "ownerPolicyByPath">,
	): Promise<FoundationClassAuditPolicyResult> {
		const ownerPolicyByPath: Record<string, FoundationOwnerPolicy> = {};
		for (const changedPath of input.changedPaths) {
			const normalizedPath = normalizeSlashes(changedPath);
			if (!isFoundationClassPath(normalizedPath)) continue;
			ownerPolicyByPath[normalizedPath] =
				await this.getFoundationOwnerPolicy(normalizedPath);
		}
		return evaluateFoundationClassAuditPolicy({
			...input,
			ownerPolicyByPath,
		});
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
		const participants = uniqueParticipants(messages);
		const operatorParticipant =
			participants.find((participant) => !participant.isAgent) || participants[0];
		const assignedOperatorId =
			normalizeOperatorIdentity(
				String(metadataRaw.author || operatorParticipant?.user || DEFAULT_CURRENT_OPERATOR_ID),
			) || DEFAULT_CURRENT_OPERATOR_ID;
		return {
			id: String(metadataRaw.id || path.basename(directory)),
			project,
			surface: String(metadataRaw.surface || "unknown"),
			title: String(metadataRaw.title || "Untitled dialogue"),
			author: assignedOperatorId,
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
			primary_agent: surfacePrimaryAgent(String(metadataRaw.surface || "unknown")),
			participants,
			assigned_operator_id: assignedOperatorId,
			is_mine: true,
			stale_state_notice: staleStateNoticeFromState(stateRaw),
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
			author: existing.author,
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
			author: "yuriy",
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
			author_id: DEFAULT_CURRENT_OPERATOR_ID,
			author: operatorAuthor(),
			content: input.message,
			created_at: timestamp,
		};
		const agentMessage: DialogueMessage = {
			id: randomUUID(),
			dialogue_id: dialogueId,
			kind: "agent",
			speaker: "DIALOGUE_STEWARD",
			author_id: "dialogue_steward",
			role_id: "DIALOGUE_STEWARD",
			author: roleAuthor("DIALOGUE_STEWARD", "DIALOGUE_STEWARD"),
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

	async beginTurn(input: {
		project?: string;
		surface: string;
		dialogueId?: string;
		message: string;
		title?: string;
	}): Promise<DialogueBeginTurnResult> {
		const project = projectSegment(input.project);
		const timestamp = nowIso();
		if (!input.dialogueId) {
			const dialogueId = randomUUID();
			const directory = await this.ensureDialogueDir(project, input.surface, dialogueId);
			const state = inferNextState(input.message);
			const metadata: DialogueMetadata = {
				id: dialogueId,
				project,
				surface: input.surface,
				title: input.title || `Dialogue on ${input.surface}`,
				author: "yuriy",
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
				author_id: DEFAULT_CURRENT_OPERATOR_ID,
				author: operatorAuthor(),
				content: input.message,
				created_at: timestamp,
			};
			await this.appendMessage(directory, operatorMessage);
			await this.appendAudit(directory, "dialogue_started", {
				project,
				state,
				surface: input.surface,
				live_cli_invocation: true,
			});
			const dialogue = await this.readDialogue(directory);
			if (!dialogue) throw new Error("Failed to read newly-created dialogue");
			return {
				dialogue,
				messages: [operatorMessage],
				operator_message: operatorMessage,
				state,
			};
		}

		const directory = this.dialogueDir(project, input.surface, input.dialogueId);
		const existing = await this.readDialogue(directory);
		if (!existing) {
			throw new Error(
				`Dialogue not found: ${project}/${input.surface}/${input.dialogueId}`,
			);
		}
		const state = inferNextState(input.message, existing.state);
		const operatorMessage: DialogueMessage = {
			id: randomUUID(),
			dialogue_id: input.dialogueId,
			kind: "operator",
			speaker: "Yuriy",
			author_id: DEFAULT_CURRENT_OPERATOR_ID,
			author: operatorAuthor(),
			content: input.message,
			created_at: timestamp,
		};
		await this.appendMessage(directory, operatorMessage);
		await this.updateDialogueState(project, input.surface, input.dialogueId, state);
		await this.appendAudit(directory, "dialogue_turn_started", {
			project,
			state,
			surface: input.surface,
			live_cli_invocation: true,
		});
		const dialogue = await this.readDialogue(directory);
		if (!dialogue) throw new Error("Failed to read updated dialogue");
		const messages = await this.readMessages(directory);
		return {
			dialogue,
			messages,
			operator_message: operatorMessage,
			state,
			previousState: existing.state,
		};
	}

	async appendRoleMessage(input: {
		project?: string;
		surface: string;
		dialogueId: string;
		kind: Extract<DialogueMessageKind, "agent" | "specialist" | "system">;
		speaker: string;
		roleId?: string;
		content: string;
		provider?: string;
		sessionId?: string;
	}): Promise<DialogueReadResult & { message: DialogueMessage }> {
		const project = projectSegment(input.project);
		const directory = this.dialogueDir(project, input.surface, input.dialogueId);
		const existing = await this.readDialogue(directory);
		if (!existing) {
			throw new Error(
				`Dialogue not found: ${project}/${input.surface}/${input.dialogueId}`,
			);
		}
		const author = roleAuthor(input.speaker, input.roleId);
		const message: DialogueMessage = {
			id: randomUUID(),
			dialogue_id: input.dialogueId,
			kind: input.kind,
			speaker: input.speaker,
			author_id: input.kind === "system" ? "system" : author.user,
			role_id: input.roleId,
			author,
			content: input.content,
			created_at: nowIso(),
		};
		await this.appendMessage(directory, message);
		await this.appendAudit(directory, "role_message_recorded", {
			project,
			surface: input.surface,
			role_id: input.roleId || "",
			provider: input.provider || "",
			session_id: input.sessionId || "",
		});
		const dialogue = await this.readDialogue(directory);
		if (!dialogue) throw new Error("Failed to read updated dialogue");
		const messages = await this.readMessages(directory);
		return { dialogue, messages, message };
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
			author_id: DEFAULT_CURRENT_OPERATOR_ID,
			author: operatorAuthor(),
			content: input.message,
			created_at: timestamp,
		};
		const agentMessage: DialogueMessage = {
			id: randomUUID(),
			dialogue_id: input.dialogueId,
			kind: "agent",
			speaker: "DIALOGUE_STEWARD",
			author_id: "dialogue_steward",
			role_id: "DIALOGUE_STEWARD",
			author: roleAuthor("DIALOGUE_STEWARD", "DIALOGUE_STEWARD"),
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

	private resolveWritableDocument(input: {
		project: string;
		surface: string;
		documentPath: string;
	}): string {
		const documentPath = normalizeSlashes(input.documentPath);
		const expectedMissionPath = `projects/${input.project}/foundations/mission.md`;
		if (
			surfaceSegments(input.surface).at(0) === "mission" &&
			documentPath !== expectedMissionPath
		) {
			throw new Error(
				`Mission commits must write the active project's mission source: ${expectedMissionPath}`,
			);
		}
		const resolved = path.resolve(this.root, documentPath);
		if (!isInsidePath(this.root, resolved)) {
			throw new Error(`Document write must stay inside the factory repo: ${documentPath}`);
		}
		return resolved;
	}

	private relativeToRoot(absolutePath: string): string {
		return normalizeSlashes(path.relative(this.root, absolutePath));
	}

	private async walkReadableDocs(directory: string): Promise<string[]> {
		if (!existsSync(directory)) return [];
		const entries = await readdir(directory, { withFileTypes: true });
		const files: string[] = [];
		const skippedDirs = new Set([
			".git",
			".turbo",
			"dist",
			"dist-electron",
			"node_modules",
			"release",
			"vendor",
			"worktree",
		]);
		const readableExtensions = new Set([
			".json",
			".jsonl",
			".md",
			".txt",
			".yaml",
			".yml",
		]);

		for (const entry of entries) {
			const absolutePath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				if (skippedDirs.has(entry.name)) continue;
				files.push(...(await this.walkReadableDocs(absolutePath)));
				continue;
			}
			if (!entry.isFile()) continue;
			if (!readableExtensions.has(path.extname(entry.name).toLowerCase())) continue;
			files.push(absolutePath);
		}
		return files;
	}

	private async foundationReviewScope(
		documentPath: string,
	): Promise<FoundationReviewScope> {
		const info = getFoundationClassPathInfo(documentPath);
		if (!info) {
			return {
				foundationsFolder: "",
				foundationFiles: [],
				citingDocs: [],
			};
		}
		const foundationsDir = path.join(this.root, ...info.foundationsRoot.split("/"));
		const foundationFiles = (await this.walkReadableDocs(foundationsDir))
			.map((filePath) => this.relativeToRoot(filePath))
			.sort();
		const citationTokens = Array.from(
			new Set([info.relativePath, info.artifactPath, info.fileName]),
		).filter((token) => token.length > 0);
		const allDocs = await this.walkReadableDocs(this.root);
		const citingDocs: string[] = [];
		for (const absolutePath of allDocs) {
			const relativePath = this.relativeToRoot(absolutePath);
			if (relativePath === info.relativePath) continue;
			const content = await readFile(absolutePath, "utf8");
			if (citationTokens.some((token) => content.includes(token))) {
				citingDocs.push(relativePath);
			}
		}
		return {
			foundationsFolder: info.foundationsRoot,
			foundationFiles,
			citingDocs: citingDocs.sort(),
		};
	}

	async getFoundationReviewScope(documentPath: string): Promise<FoundationReviewScope> {
		const normalizedPath = normalizeSlashes(documentPath);
		if (!isFoundationClassPath(normalizedPath)) {
			return {
				foundationsFolder: "",
				foundationFiles: [],
				citingDocs: [],
			};
		}
		return this.foundationReviewScope(normalizedPath);
	}

	private async writeFoundationCascadeDrafts(input: {
		directory: string;
		dialogueId: string;
		documentPath: string;
		reason: string;
		reviewScope: FoundationReviewScope;
	}): Promise<DialogueCascadeDraft[]> {
		if (input.reviewScope.citingDocs.length === 0) return [];
		const draftsDir = path.join(input.directory, "cascade-drafts");
		await mkdir(draftsDir, { recursive: true });
		const timestamp = nowIso();
		const drafts: DialogueCascadeDraft[] = [];

		for (const [index, citingDoc] of input.reviewScope.citingDocs.entries()) {
			const ordinal = String(index + 1).padStart(2, "0");
			const id = `WO-LDP-CASCADE-${input.dialogueId.slice(0, 8).toUpperCase()}-${ordinal}`;
			const draftPath = path.join(draftsDir, `${id}.yml`);
			const relativeDraftPath = this.relativeToRoot(draftPath);
			const title = `Review ${citingDoc} after foundation update`;
			const summary = `Mandatory foundation-class cascade draft for ${citingDoc}.`;
			const body = [
				`id: ${JSON.stringify(id)}`,
				`title: ${JSON.stringify(title)}`,
				'status: "queued"',
				'created_by: "DIALOGUE_STEWARD"',
				`created_at: ${JSON.stringify(timestamp)}`,
				`source_foundation: ${JSON.stringify(input.documentPath)}`,
				`citing_doc: ${JSON.stringify(citingDoc)}`,
				`originating_dialogue: ${JSON.stringify(input.dialogueId)}`,
				`operator_reason: ${JSON.stringify(input.reason)}`,
				"acceptance_criteria:",
				`  - ${JSON.stringify(`Review ${citingDoc} against ${input.documentPath}.`)}`,
				'  - "Update only if the foundation-class change has non-trivial impact."',
				'  - "Record verification evidence before closing this cascade draft."',
				"",
			].join("\n");
			await writeFile(draftPath, body, "utf8");
			drafts.push({
				id,
				title,
				href: `/factory/work-orders/${id}`,
				status: "queued",
				summary,
				source_path: relativeDraftPath,
			});
		}

		return drafts;
	}

	private async writeDocumentCommit(
		directory: string,
		input: Required<Pick<DialogueCommitInput, "documentPath" | "documentAfter">> &
			Pick<
				DialogueCommitInput,
				| "documentBefore"
				| "notes"
				| "operatorName"
				| "operatorReason"
				| "visualDiffConfirmed"
			> & {
				dialogueId: string;
				project: string;
				surface: string;
			},
	): Promise<DocumentCommitResult> {
		const documentPath = normalizeSlashes(input.documentPath);
		const filePath = this.resolveWritableDocument({
			project: input.project,
			surface: input.surface,
			documentPath,
		});
		const current = existsSync(filePath) ? await readFile(filePath, "utf8") : "";
		if (input.documentBefore !== undefined && current !== input.documentBefore) {
			throw new Error(`Document changed before commit could apply: ${documentPath}`);
		}
		const isFoundationCommit =
			isFoundationClassPath(documentPath) || isFoundationClassSurface(input.surface);
		if (isFoundationCommit && !isFoundationClassPath(documentPath)) {
			throw new Error(
				`Foundation-class commits must target projects/<project>/foundations/**: ${documentPath}`,
			);
		}
		let documentAfter = input.documentAfter;
		let reviewScope: FoundationReviewScope | undefined;
		let cascadeDrafts: DialogueCascadeDraft[] = [];
		let lockDateDetails:
			| ReturnType<typeof applyFoundationLockDate>
			| undefined;
		let ownerPolicy: FoundationOwnerPolicy | undefined;

		if (isFoundationCommit) {
			ownerPolicy = await this.getFoundationOwnerPolicy(documentPath);
			if (!isFoundationOwner(input.operatorName, ownerPolicy)) {
				throw new Error(
					`Foundation-class commits require approval from ${ownerPolicy.ownerLabel}.`,
				);
			}
			const reason = (input.operatorReason || input.notes || "").trim();
			if (!reason) {
				throw new Error("Foundation-class commits require an operator-stated reason.");
			}
			if (!input.visualDiffConfirmed) {
				throw new Error("Foundation-class commits require visual diff confirmation.");
			}
			if (input.documentAfter === current) {
				throw new Error(
					"Foundation-class commits require a substantive document draft before the lock-date update.",
				);
			}
			lockDateDetails = applyFoundationLockDate(input.documentAfter, nowIso().slice(0, 10));
			documentAfter = lockDateDetails.content;
			reviewScope = await this.foundationReviewScope(documentPath);
		}

		const diff = buildUnifiedTextDiff(current, documentAfter, {
			beforeLabel: documentPath,
			afterLabel: `${documentPath} (proposed)`,
		});
		await writeFile(filePath, documentAfter, "utf8");

		if (isFoundationCommit && reviewScope) {
			const reason = (input.operatorReason || input.notes || "").trim();
			cascadeDrafts = await this.writeFoundationCascadeDrafts({
				directory,
				dialogueId: input.dialogueId,
				documentPath,
				reason,
				reviewScope,
			});
			await this.appendAudit(directory, "foundation_class_document_written", {
				project: input.project,
				surface: input.surface,
				document_path: documentPath,
				operator: input.operatorName || "",
				owner_identity: ownerPolicy?.ownerLabel || "",
				owner_source_path: ownerPolicy?.ownerSourcePath || "",
				operator_reason: reason,
				visual_diff_confirmed: true,
				full_diff: diff,
				lock_date_commit_date: lockDateDetails?.commitDate || "",
				lock_date_previous: lockDateDetails?.previousLockText || "",
				lock_date_next: lockDateDetails?.nextLockText || "",
				review_scope: JSON.stringify(reviewScope),
				cascade_drafts: JSON.stringify(cascadeDrafts),
			});
			return {
				foundationClass: true,
				documentPath,
				diff,
				reviewScope,
				cascadeDrafts,
			};
		}

		await this.appendAudit(directory, "document_written", {
			project: input.project,
			surface: input.surface,
			document_path: documentPath,
			bytes_before: String(current.length),
			bytes_after: String(documentAfter.length),
		});
		return {
			foundationClass: false,
			documentPath,
			diff,
			cascadeDrafts,
		};
	}

	async commit(input: DialogueCommitInput): Promise<DialogueRecord> {
		const project = projectSegment(input.project);
		const directory = this.dialogueDir(project, input.surface, input.dialogueId);
		const existing = await this.readDialogue(directory);
		if (!existing) {
			throw new Error(
				`Dialogue not found: ${project}/${input.surface}/${input.dialogueId}`,
			);
		}
		let documentCommit: DocumentCommitResult | null = null;
		if (input.documentPath && input.documentAfter !== undefined) {
			documentCommit = await this.writeDocumentCommit(directory, {
				project,
				surface: input.surface,
				dialogueId: input.dialogueId,
				documentPath: input.documentPath,
				documentBefore: input.documentBefore,
				documentAfter: input.documentAfter,
				notes: input.notes,
				operatorName: input.operatorName,
				operatorReason: input.operatorReason,
				visualDiffConfirmed: input.visualDiffConfirmed,
			});
		}
		const cascadeId = `WO-LDP-CASCADE-${input.dialogueId.slice(0, 8).toUpperCase()}`;
		const cascadeDrafts = documentCommit?.cascadeDrafts.length
			? documentCommit.cascadeDrafts
			: [
					{
						id: cascadeId,
						title: `Cascade from ${surfaceLabel(input.surface)} dialogue`,
						href: `/factory/work-orders/${cascadeId}`,
						status: "draft",
						summary:
							"The next implementation work order must cite this dialogue before writing.",
					},
				];
		await this.appendAudit(directory, "commit_requested", {
			project,
			notes: input.notes || "",
			document_path: input.documentPath || "",
			operator: input.operatorName || "",
			dialogue_steward_bridge: true,
			foundation_class: Boolean(documentCommit?.foundationClass),
			cascade_work_order: cascadeDrafts[0]?.href || `/factory/work-orders/${cascadeId}`,
			cascade_draft_list: JSON.stringify(cascadeDrafts),
			approval_queue: "/factory/approvals",
		});
		const cascadeLinks = cascadeDrafts
			.map((draft) => `[${draft.id}](${draft.href})`)
			.join(", ");
		await this.appendMessage(directory, {
			id: randomUUID(),
			dialogue_id: input.dialogueId,
			kind: "agent",
			speaker: "DIALOGUE_STEWARD",
			author_id: "dialogue_steward",
			role_id: "DIALOGUE_STEWARD",
			author: roleAuthor("DIALOGUE_STEWARD", "DIALOGUE_STEWARD"),
			content: `Commit recorded${input.documentPath ? ` for \`${normalizeSlashes(input.documentPath)}\`` : ""}. Cascade draft links: ${cascadeLinks || "none"} and [Approval Queue](/factory/approvals). The next implementation work order must cite this dialogue before writing.`,
			created_at: nowIso(),
		});
		return this.updateDialogueState(project, input.surface, input.dialogueId, "cascade_pending", {
			auditEvent: "commit_recorded",
		});
	}

	async get(input: {
		project?: string;
		surface: string;
		dialogueId: string;
	}): Promise<DialogueReadResult> {
		const project = projectSegment(input.project);
		const directory = this.dialogueDir(project, input.surface, input.dialogueId);
		const dialogue = await this.readDialogue(directory);
		if (!dialogue) {
			throw new Error(
				`Dialogue not found: ${project}/${input.surface}/${input.dialogueId}`,
			);
		}
		return {
			dialogue,
			messages: await this.readMessages(directory),
		};
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
		operatorId?: string;
		workspaceId?: string;
	} = {}): Promise<DialogueAttentionCounts> {
		const operatorId = safeSegment(input.operatorId || DEFAULT_CURRENT_OPERATOR_ID);
		const workspaceId = safeSegment(
			input.workspaceId || input.project || DEFAULT_DIALOGUE_PROJECT_ID,
		);
		const items = (
			await this.list({ project: input.project, surface: input.surface })
		)
			.map((record) => ({
				...record,
				is_mine: record.assigned_operator_id === operatorId,
			}))
			.filter(
				(record) =>
					record.is_mine &&
					HIGH_ATTENTION_STATES.has(record.state) &&
					operatorSurfaceKey(record.surface),
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
			operator_id: operatorId,
			workspace_id: workspaceId,
		};
	}
}

let singleton: FactoryDialogueStore | null = null;

export function getFactoryDialogueStore(): FactoryDialogueStore {
	singleton ??= new FactoryDialogueStore();
	return singleton;
}
