import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
	appendFile,
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import path from "node:path";

export type CurationTrigger =
	| "three_snippets"
	| "fourteen_day_cadence"
	| "operator_requested"
	| "cross_input_synthesis";

export interface DomainKnowledgeDoc {
	id: string;
	title: string;
	file_name: string;
	path: string;
	relative_path: string;
	content: string;
	exists: boolean;
	modified_at?: string;
}

export interface DomainKnowledgeSnippet {
	id: string;
	file_name: string;
	path: string;
	relative_path: string;
	content: string;
	body: string;
	curated: boolean;
	curated_into?: string;
	curated_at?: string;
	modified_at?: string;
}

export interface DomainKnowledgeCurationState {
	lastCuratedAt?: string;
	snippetsCuratedCount: number;
	snippetsSinceLastCuration: number;
	curationHistory: Array<{
		id: string;
		curatedAt: string;
		operator: string;
		sourceSnippets: string[];
		updatedDocs: string[];
		summary: string;
	}>;
}

export interface DomainKnowledgeAreaSummary {
	project_id: string;
	area: string;
	label: string;
	area_path: string;
	area_relative_path: string;
	state_path: string;
	state_relative_path: string;
	last_curated_at?: string;
	total_snippets: number;
	uncurated_snippets: number;
	snippets_since_last_curation: number;
	structured_doc_count: number;
	needs_curation: boolean;
	trigger_reasons: CurationTrigger[];
	next_review_due?: string;
	source_path: string;
	source_relative_path: string;
}

export interface DomainKnowledgeAreaDetail extends DomainKnowledgeAreaSummary {
	docs: DomainKnowledgeDoc[];
	snippets: DomainKnowledgeSnippet[];
	curation_state: DomainKnowledgeCurationState;
	policy_path: string;
	prompt_path: string;
}

export interface DomainKnowledgeCurationTarget {
	path: string;
	type: "structured_doc";
	action: "create" | "update";
	before_content: string;
	after_content: string;
	summary: string;
}

export interface DomainKnowledgeCurationDraft {
	id: string;
	project_id: string;
	area: string;
	created_at: string;
	trigger: CurationTrigger;
	summary: string;
	source_snippets: string[];
	targets: DomainKnowledgeCurationTarget[];
	state_path: string;
	draft_path: string;
	draft_relative_path: string;
}

export interface DomainKnowledgeCommitResult {
	curation_id: string;
	project_id: string;
	area: string;
	status: "curated";
	applied_targets: string[];
	updated_snippets: string[];
	state_path: string;
	audit_path: string;
	receipt_path: string;
}

export type DomainKnowledgeStreamEvent =
	| { type: "status"; message: string }
	| { type: "chunk"; chunk: string }
	| { type: "complete"; message: string }
	| { type: "error"; error: string };

interface StoreOptions {
	root?: string;
}

interface FrontmatterParse {
	data: Record<string, string>;
	body: string;
}

interface FileOperation {
	target: string;
	finalPath: string;
	content: string;
	action: "create" | "update" | "append";
}

interface BackupEntry {
	path: string;
	existed: boolean;
	content?: string;
}

const STRUCTURED_DOCS = [
	{ id: "overview", fileName: "overview.md", title: "Overview" },
	{ id: "ai-applications", fileName: "ai-applications.md", title: "AI Applications" },
	{ id: "common-pitfalls", fileName: "common-pitfalls.md", title: "Common Pitfalls" },
	{ id: "tools-landscape", fileName: "tools-landscape.md", title: "Tools Landscape" },
] as const;

const POLICY_PATH =
	"projects/_shared/foundations/domain-knowledge-curation-cadence-policy.md";
const PROMPT_PATH =
	"templates/role-prompts/DOMAIN_KNOWLEDGE_STEWARD-curation-prompt.md";

const normalizeSlashes = (value: string) => value.replace(/\\/g, "/");
const nowIso = () => new Date().toISOString();

const formatLabel = (value: string) =>
	value
		.split(/[-_]+/g)
		.filter(Boolean)
		.map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
		.join(" ") || value;

const safeSegment = (value: string) => {
	const sanitized = value.trim().replace(/[^A-Za-z0-9._-]+/g, "-");
	if (!sanitized || sanitized === "." || sanitized === "..") {
		throw new Error(`Invalid path segment: ${value}`);
	}
	return sanitized;
};

const projectSegments = (projectId: string) =>
	normalizeSlashes(projectId)
		.split("/")
		.filter(Boolean)
		.map(safeSegment);

const isInsidePath = (base: string, candidate: string) => {
	const relative = path.relative(base, candidate);
	return (
		relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
	);
};

const resolveInside = (base: string, relativePath: string) => {
	const normalized = normalizeSlashes(relativePath).replace(/^\/+/, "");
	const candidate = path.resolve(base, normalized);
	if (!isInsidePath(base, candidate)) {
		throw new Error(`Path escapes factory root: ${relativePath}`);
	}
	return candidate;
};

const findFactoryRoot = () => {
	const explicit = process.env.SOFTWARE_FACTORY_ROOT || process.env.FACTORY_ROOT;
	if (explicit) return path.resolve(explicit);

	let current = process.cwd();
	for (let index = 0; index < 14; index += 1) {
		if (
			existsSync(path.join(current, "projects")) &&
			existsSync(path.join(current, "work-orders"))
		) {
			return current;
		}
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}

	throw new Error("Unable to locate Software Factory root");
};

const readText = async (filePath: string) => {
	try {
		return await readFile(filePath, "utf8");
	} catch {
		return "";
	}
};

const writeJson = async (filePath: string, value: unknown) => {
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const readJson = async <T>(filePath: string): Promise<T | undefined> => {
	const raw = await readText(filePath);
	if (!raw.trim()) return undefined;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return undefined;
	}
};

const parseFrontmatter = (content: string): FrontmatterParse => {
	if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
		return { data: {}, body: content };
	}
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) return { data: {}, body: content };
	const data: Record<string, string> = {};
	for (const line of match[1].split(/\r?\n/)) {
		const item = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (item) data[item[1]] = item[2].trim().replace(/^["']|["']$/g, "");
	}
	return { data, body: content.slice(match[0].length) };
};

const frontmatterValue = (value: unknown) =>
	String(value ?? "")
		.replace(/\r?\n/g, " ")
		.trim();

const renderFrontmatter = (metadata: Record<string, string>) =>
	`---\n${Object.entries(metadata)
		.map(([key, value]) => `${key}: ${frontmatterValue(value)}`)
		.join("\n")}\n---\n\n`;

const withSnippetCurationFrontmatter = (
	content: string,
	input: { curatedInto: string[]; curatedAt: string },
) => {
	const parsed = parseFrontmatter(content);
	return `${renderFrontmatter({
		...parsed.data,
		curated_into: input.curatedInto.join("; "),
		curated_at: input.curatedAt,
	})}${parsed.body.trimStart()}`;
};

const firstMeaningfulLine = (content: string) =>
	content
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line && !line.startsWith("#") && !line.startsWith("---")) ||
	"Snippet captured domain knowledge.";

const daysBetween = (left?: string, right = nowIso()) => {
	if (!left) return Number.POSITIVE_INFINITY;
	const leftDate = new Date(left).getTime();
	const rightDate = new Date(right).getTime();
	if (Number.isNaN(leftDate) || Number.isNaN(rightDate)) {
		return Number.POSITIVE_INFINITY;
	}
	return (rightDate - leftDate) / (24 * 60 * 60 * 1000);
};

function defaultCurationState(): DomainKnowledgeCurationState {
	return {
		snippetsCuratedCount: 0,
		snippetsSinceLastCuration: 0,
		curationHistory: [],
	};
}

function curationTriggerReasons(
	state: DomainKnowledgeCurationState,
	uncuratedSnippetCount: number,
): CurationTrigger[] {
	const reasons: CurationTrigger[] = [];
	if (uncuratedSnippetCount >= 3) reasons.push("three_snippets");
	if (uncuratedSnippetCount > 0 && daysBetween(state.lastCuratedAt) >= 14) {
		reasons.push("fourteen_day_cadence");
	}
	return reasons;
}

async function atomicWriteOperations(
	stagingDir: string,
	operations: FileOperation[],
	simulateFailureAt?: number,
) {
	const backups: BackupEntry[] = [];
	const applied: BackupEntry[] = [];
	await mkdir(stagingDir, { recursive: true });

	try {
		for (const operation of operations) {
			backups.push({
				path: operation.finalPath,
				existed: existsSync(operation.finalPath),
				content: existsSync(operation.finalPath)
					? await readFile(operation.finalPath, "utf8")
					: undefined,
			});
			const stagedPath = path.join(stagingDir, operation.target);
			await mkdir(path.dirname(stagedPath), { recursive: true });
			await writeFile(stagedPath, operation.content, "utf8");
		}

		for (const [index, operation] of operations.entries()) {
			if (simulateFailureAt && index + 1 === simulateFailureAt) {
				throw new Error(`Simulated curation failure at operation ${simulateFailureAt}`);
			}
			const stagedPath = path.join(stagingDir, operation.target);
			await mkdir(path.dirname(operation.finalPath), { recursive: true });
			const backup = backups.find((entry) => entry.path === operation.finalPath);
			if (existsSync(operation.finalPath)) {
				await rm(operation.finalPath, { force: true });
			}
			await rename(stagedPath, operation.finalPath);
			if (backup) applied.push(backup);
		}
	} catch (error) {
		for (const backup of applied.reverse()) {
			if (backup.existed && backup.content !== undefined) {
				await mkdir(path.dirname(backup.path), { recursive: true });
				await writeFile(backup.path, backup.content, "utf8");
			} else if (!backup.existed && existsSync(backup.path)) {
				await rm(backup.path, { force: true });
			}
		}
		throw error;
	} finally {
		await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
	}
}

export class FactoryDomainKnowledgeStore {
	private readonly root: string;

	constructor(options: StoreOptions = {}) {
		this.root = path.resolve(options.root || findFactoryRoot());
	}

	async listAreas(input: { project_id: string }): Promise<DomainKnowledgeAreaSummary[]> {
		const root = this.domainKnowledgeRoot(input.project_id);
		if (!existsSync(root)) return [];
		const entries = await readdir(root, { withFileTypes: true });
		const areas: DomainKnowledgeAreaSummary[] = [];
		for (const entry of entries) {
			if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
			areas.push(await this.areaSummary(input.project_id, entry.name));
		}
		return areas.sort((left, right) => {
			if (left.needs_curation !== right.needs_curation) {
				return left.needs_curation ? -1 : 1;
			}
			return left.area.localeCompare(right.area);
		});
	}

	async getArea(input: {
		project_id: string;
		area: string;
	}): Promise<DomainKnowledgeAreaDetail> {
		const summary = await this.areaSummary(input.project_id, input.area);
		const docs = await this.readStructuredDocs(input.project_id, input.area);
		const snippets = await this.readSnippets(input.project_id, input.area);
		const curation_state = await this.readState(input.project_id, input.area);
		return {
			...summary,
			docs,
			snippets,
			curation_state,
			policy_path: POLICY_PATH,
			prompt_path: PROMPT_PATH,
		};
	}

	async runCuration(input: {
		project_id: string;
		area: string;
		trigger?: CurationTrigger;
		operator_reason?: string;
	}): Promise<DomainKnowledgeCurationDraft> {
		const detail = await this.getArea(input);
		const uncurated = detail.snippets.filter((snippet) => !snippet.curated);
		if (uncurated.length === 0) {
			throw new Error(
				`No uncurated snippets are available for ${input.project_id}/${input.area}.`,
			);
		}

		const timestamp = nowIso();
		const curationId = `curation-${timestamp.replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
		const targets = detail.docs.map((doc) =>
			this.buildCurationTarget({
				doc,
				projectId: input.project_id,
				area: input.area,
				snippets: uncurated,
				timestamp,
			}),
		);
		const draft: DomainKnowledgeCurationDraft = {
			id: curationId,
			project_id: input.project_id,
			area: input.area,
			created_at: timestamp,
			trigger: input.trigger || "operator_requested",
			summary:
				input.operator_reason ||
				`Curate ${uncurated.length} intake snippet(s) into ${detail.label}.`,
			source_snippets: uncurated.map((snippet) => snippet.relative_path),
			targets,
			state_path: detail.state_relative_path,
			draft_path: "",
			draft_relative_path: "",
		};
		const draftPath = this.draftPath(input.project_id, input.area, curationId);
		draft.draft_path = draftPath;
		draft.draft_relative_path = this.relativeToRoot(draftPath);
		await writeJson(draftPath, draft);
		return draft;
	}

	async submitDialogueTurn(
		input: { project_id: string; area: string; message: string },
		onEvent?: (event: DomainKnowledgeStreamEvent) => void,
	): Promise<string> {
		const detail = await this.getArea(input);
		onEvent?.({
			type: "status",
			message: "DOMAIN_KNOWLEDGE_STEWARD is reading this domain area...",
		});
		const response = [
			`DOMAIN_KNOWLEDGE_STEWARD reviewed \`${detail.area_relative_path}\`.`,
			`Current status: ${detail.uncurated_snippets} uncurated snippet(s), ${detail.structured_doc_count} structured doc(s), last curated ${detail.last_curated_at || "never"}.`,
			detail.needs_curation
				? `Curation is recommended because: ${detail.trigger_reasons.join(", ")}.`
				: "No cadence trigger is currently firing. Yuriy can still use Curate now for an operator-requested pass.",
			"Use Curate now to generate a diff preview before any write occurs.",
		].join("\n\n");
		onEvent?.({ type: "chunk", chunk: response });
		const dialoguePath = this.dialogueAuditPath(input.project_id, input.area, "dialogue.jsonl");
		await mkdir(path.dirname(dialoguePath), { recursive: true });
		await appendFile(
			dialoguePath,
			`${JSON.stringify({
				id: randomUUID(),
				at: nowIso(),
				project_id: input.project_id,
				area: input.area,
				operator_message: input.message,
				role_id: "DOMAIN_KNOWLEDGE_STEWARD",
				response,
			})}\n`,
			"utf8",
		);
		onEvent?.({ type: "complete", message: "Dialogue turn complete" });
		return response;
	}

	async commitCuration(input: {
		project_id: string;
		area: string;
		curation_id: string;
		operator_reason?: string;
		edited_targets?: Array<{ path: string; content: string }>;
		simulate_failure_at?: number;
	}): Promise<DomainKnowledgeCommitResult> {
		const draft = await this.readDraft(
			input.project_id,
			input.area,
			input.curation_id,
		);
		const editedTargets = new Map(
			(input.edited_targets || []).map((target) => [
				normalizeSlashes(target.path),
				target.content,
			]),
		);
		const timestamp = nowIso();
		const state = await this.readState(input.project_id, input.area);
		const updatedDocPaths = draft.targets.map((target) => target.path);
		const operations: FileOperation[] = [];

		for (const target of draft.targets) {
			const finalPath = resolveInside(this.root, target.path);
			operations.push({
				target: target.path,
				finalPath,
				action: target.action,
				content: editedTargets.get(target.path) ?? target.after_content,
			});
		}

		for (const snippetPath of draft.source_snippets) {
			const finalPath = resolveInside(this.root, snippetPath);
			const current = await readText(finalPath);
			operations.push({
				target: snippetPath,
				finalPath,
				action: "update",
				content: withSnippetCurationFrontmatter(current, {
					curatedAt: timestamp,
					curatedInto: updatedDocPaths,
				}),
			});
		}

		const nextState: DomainKnowledgeCurationState = {
			lastCuratedAt: timestamp,
			snippetsCuratedCount:
				(state.snippetsCuratedCount || 0) + draft.source_snippets.length,
			snippetsSinceLastCuration: 0,
			curationHistory: [
				...(state.curationHistory || []),
				{
					id: draft.id,
					curatedAt: timestamp,
					operator: "Yuriy",
					sourceSnippets: draft.source_snippets,
					updatedDocs: updatedDocPaths,
					summary: input.operator_reason || draft.summary,
				},
			],
		};
		const statePath = this.statePath(input.project_id, input.area);
		operations.push({
			target: this.relativeToRoot(statePath),
			finalPath: statePath,
			action: existsSync(statePath) ? "update" : "create",
			content: `${JSON.stringify(nextState, null, 2)}\n`,
		});

		const auditPath = this.dialogueAuditPath(
			input.project_id,
			input.area,
			"audit.jsonl",
		);
		const currentAudit = await readText(auditPath);
		const auditLine = JSON.stringify({
			id: randomUUID(),
			event: "domain_knowledge_curated",
			at: timestamp,
			project_id: input.project_id,
			area: input.area,
			curation_id: draft.id,
			operator_reason: input.operator_reason || draft.summary,
			source_snippets: draft.source_snippets,
			updated_docs: updatedDocPaths,
		});
		operations.push({
			target: this.relativeToRoot(auditPath),
			finalPath: auditPath,
			action: currentAudit.trim() ? "append" : "create",
			content: `${currentAudit}${auditLine}\n`,
		});

		const receiptPath = this.dialogueAuditPath(
			input.project_id,
			input.area,
			`curation-${draft.id}-receipt.json`,
		);
		operations.push({
			target: this.relativeToRoot(receiptPath),
			finalPath: receiptPath,
			action: "create",
			content: `${JSON.stringify(
				{
					curation_id: draft.id,
					project_id: input.project_id,
					area: input.area,
					applied_at: timestamp,
					applied_targets: updatedDocPaths,
					updated_snippets: draft.source_snippets,
					operator_reason: input.operator_reason || draft.summary,
				},
				null,
				2,
			)}\n`,
		});

		await atomicWriteOperations(
			path.join(this.root, "runs", ".domain-knowledge-curation-staging", draft.id),
			operations,
			input.simulate_failure_at,
		);

		return {
			curation_id: draft.id,
			project_id: input.project_id,
			area: input.area,
			status: "curated",
			applied_targets: updatedDocPaths,
			updated_snippets: draft.source_snippets,
			state_path: this.relativeToRoot(statePath),
			audit_path: this.relativeToRoot(auditPath),
			receipt_path: this.relativeToRoot(receiptPath),
		};
	}

	private domainKnowledgeRoot(projectId: string) {
		return path.join(this.root, "projects", ...projectSegments(projectId), "domain-knowledge");
	}

	private areaRoot(projectId: string, area: string) {
		return path.join(this.domainKnowledgeRoot(projectId), safeSegment(area));
	}

	private statePath(projectId: string, area: string) {
		return path.join(this.areaRoot(projectId, area), ".curation-state.json");
	}

	private snippetsRoot(projectId: string, area: string) {
		return path.join(this.areaRoot(projectId, area), "intake-snippets");
	}

	private draftPath(projectId: string, area: string, curationId: string) {
		return path.join(
			this.root,
			"runs",
			"dialogues",
			...projectSegments(projectId),
			"domain-knowledge",
			safeSegment(area),
			"curations",
			safeSegment(curationId),
			"curation-packet.json",
		);
	}

	private dialogueAuditPath(projectId: string, area: string, fileName: string) {
		return path.join(
			this.root,
			"runs",
			"dialogues",
			...projectSegments(projectId),
			"domain-knowledge",
			safeSegment(area),
			fileName,
		);
	}

	private relativeToRoot(filePath: string) {
		return normalizeSlashes(path.relative(this.root, filePath));
	}

	private async readState(
		projectId: string,
		area: string,
	): Promise<DomainKnowledgeCurationState> {
		return (
			(await readJson<DomainKnowledgeCurationState>(
				this.statePath(projectId, area),
			)) || defaultCurationState()
		);
	}

	private async readStructuredDocs(projectId: string, area: string) {
		const docs: DomainKnowledgeDoc[] = [];
		for (const spec of STRUCTURED_DOCS) {
			const filePath = path.join(this.areaRoot(projectId, area), spec.fileName);
			const exists = existsSync(filePath);
			const stats = exists ? await stat(filePath).catch(() => undefined) : undefined;
			docs.push({
				id: spec.id,
				title: spec.title,
				file_name: spec.fileName,
				path: filePath,
				relative_path: this.relativeToRoot(filePath),
				content: exists ? await readText(filePath) : "",
				exists,
				modified_at: stats?.mtime.toISOString(),
			});
		}
		return docs;
	}

	private async readSnippets(projectId: string, area: string) {
		const snippetsDir = this.snippetsRoot(projectId, area);
		if (!existsSync(snippetsDir)) return [];
		const entries = await readdir(snippetsDir, { withFileTypes: true });
		const snippets: DomainKnowledgeSnippet[] = [];
		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
			const filePath = path.join(snippetsDir, entry.name);
			const content = await readText(filePath);
			const parsed = parseFrontmatter(content);
			const stats = await stat(filePath).catch(() => undefined);
			snippets.push({
				id: entry.name.replace(/\.md$/, ""),
				file_name: entry.name,
				path: filePath,
				relative_path: this.relativeToRoot(filePath),
				content,
				body: parsed.body,
				curated: Boolean(parsed.data.curated_at || parsed.data.curated_into),
				curated_into: parsed.data.curated_into,
				curated_at: parsed.data.curated_at,
				modified_at: stats?.mtime.toISOString(),
			});
		}
		return snippets.sort((left, right) => left.file_name.localeCompare(right.file_name));
	}

	private async areaSummary(
		projectId: string,
		area: string,
	): Promise<DomainKnowledgeAreaSummary> {
		const areaPath = this.areaRoot(projectId, area);
		const statePath = this.statePath(projectId, area);
		const docs = await this.readStructuredDocs(projectId, area);
		const snippets = await this.readSnippets(projectId, area);
		const state = await this.readState(projectId, area);
		const uncuratedSnippetCount = snippets.filter((snippet) => !snippet.curated).length;
		const triggerReasons = curationTriggerReasons(state, uncuratedSnippetCount);
		const nextReviewDue = state.lastCuratedAt
			? new Date(
					new Date(state.lastCuratedAt).getTime() + 14 * 24 * 60 * 60 * 1000,
				).toISOString()
			: undefined;
		return {
			project_id: projectId,
			area,
			label: formatLabel(area),
			area_path: areaPath,
			area_relative_path: this.relativeToRoot(areaPath),
			state_path: statePath,
			state_relative_path: this.relativeToRoot(statePath),
			last_curated_at: state.lastCuratedAt,
			total_snippets: snippets.length,
			uncurated_snippets: uncuratedSnippetCount,
			snippets_since_last_curation: uncuratedSnippetCount,
			structured_doc_count: docs.filter((doc) => doc.exists && doc.content.trim()).length,
			needs_curation: triggerReasons.length > 0,
			trigger_reasons: triggerReasons,
			next_review_due: nextReviewDue,
			source_path: areaPath,
			source_relative_path: this.relativeToRoot(areaPath),
		};
	}

	private buildCurationTarget(input: {
		doc: DomainKnowledgeDoc;
		projectId: string;
		area: string;
		snippets: DomainKnowledgeSnippet[];
		timestamp: string;
	}): DomainKnowledgeCurationTarget {
		const section = this.curationSectionForDoc(input);
		const before = input.doc.content;
		const after = before.trim()
			? `${before.trimEnd()}\n\n${section}`
			: `# ${input.doc.title}\n\nStatus: curated by DOMAIN_KNOWLEDGE_STEWARD\nProject: \`${input.projectId}\`\nArea: \`${input.area}\`\n\n${section}`;
		return {
			path: input.doc.relative_path,
			type: "structured_doc",
			action: input.doc.exists ? "update" : "create",
			before_content: before,
			after_content: after.trimEnd().concat("\n"),
			summary: `Update ${input.doc.file_name} from ${input.snippets.length} uncurated snippet(s).`,
		};
	}

	private curationSectionForDoc(input: {
		doc: DomainKnowledgeDoc;
		projectId: string;
		area: string;
		snippets: DomainKnowledgeSnippet[];
		timestamp: string;
	}) {
		const bullets = input.snippets
			.map(
				(snippet) =>
					`- ${firstMeaningfulLine(snippet.body)} (source: \`${snippet.relative_path}\`)`,
			)
			.join("\n");
		const sectionTitle =
			input.doc.id === "overview"
				? "Domain observations"
				: input.doc.id === "ai-applications"
					? "AI and agentic application implications"
					: input.doc.id === "common-pitfalls"
						? "Pitfalls, risks, and ambiguity"
						: "Tools and vendor references";
		return `## Curation ${input.timestamp.slice(0, 10)} - ${sectionTitle}

Curated by DOMAIN_KNOWLEDGE_STEWARD from ${input.snippets.length} intake snippet(s).

${bullets}
`;
	}

	private async readDraft(
		projectId: string,
		area: string,
		curationId: string,
	): Promise<DomainKnowledgeCurationDraft> {
		const draftPath = this.draftPath(projectId, area, curationId);
		const draft = await readJson<DomainKnowledgeCurationDraft>(draftPath);
		if (!draft) {
			throw new Error(`Curation draft not found: ${curationId}`);
		}
		return draft;
	}
}

let singleton: FactoryDomainKnowledgeStore | undefined;

export const getFactoryDomainKnowledgeStore = () => {
	if (!singleton) {
		singleton = new FactoryDomainKnowledgeStore();
	}
	return singleton;
};

