import { createHash, randomUUID } from "node:crypto";
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

import { invokeFactoryCliRole } from "main/lib/factory-cli";
import {
	buildIntakeClassificationPrompt,
	buildIntakeDialoguePrompt,
	buildIntakeDigestPrompt,
	buildIntakePropagationPrompt,
} from "main/lib/factory-cli/intake-prompts";

export type IntakeStatus =
	| "pending"
	| "digesting"
	| "digested"
	| "propagated"
	| "shelved"
	| "declined";

export type IntakeOutputKey =
	| "01-key-insights"
	| "02-confirmed-facts"
	| "03-open-questions"
	| "04-product-implications"
	| "05-domain-knowledge"
	| "06-strategy-signals"
	| "07-lessons-candidates"
	| "08-propagation-targets";

export interface IntakeListItem {
	id: string;
	project_id: string;
	type: string;
	title: string;
	slug: string;
	status: IntakeStatus;
	folder_path: string;
	folder_relative_path: string;
	inventory_path?: string;
	summary_preview?: string;
	ingested_at?: string;
	last_activity_at?: string;
	propagation_target_count: number;
}

export interface IntakeOutput {
	key: IntakeOutputKey;
	title: string;
	path: string;
	content: string;
}

export interface IntakeDialogueMessage {
	id: string;
	intake_id: string;
	project_id: string;
	speaker: "operator" | "agent" | "system";
	role_id?: string;
	content: string;
	created_at: string;
}

export interface IntakePropagationTarget {
	path: string;
	reason?: string;
	status?: "candidate" | "staged" | "applied" | "blocked";
	content?: string;
}

export interface IntakeBundle {
	item: IntakeListItem;
	raw_input: string;
	summary?: string;
	outputs: IntakeOutput[];
	propagation_plan?: string;
	propagation_targets: IntakePropagationTarget[];
	dialogue: IntakeDialogueMessage[];
	receipts: string[];
	attachments: string[];
}

export interface IntakeCreateDraftInput {
	project_id: string;
	type?: string;
	title?: string;
	slug?: string;
	operator_text?: string;
	source_urls?: string[];
	attachment_paths?: string[];
}

export interface IntakeClassificationResult {
	intake_id: string;
	intake_type: string;
	title: string;
	slug: string;
	project_id: string;
	confidence: number;
	reason: string;
	raw_response: string;
}

export interface IntakeStreamEvent {
	type: "status" | "chunk" | "complete" | "error";
	message?: string;
	chunk?: string;
	item?: IntakeListItem;
	bundle?: IntakeBundle;
	error?: string;
}

export interface IntakeListInput {
	project_id?: string;
	status?: IntakeStatus | "all";
	type?: string;
	search?: string;
	include_propagated?: boolean;
}

export interface IntakeStoreOptions {
	root?: string;
}

interface IntakeMetadata {
	project_id: string;
	type: string;
	title: string;
	slug: string;
	status: IntakeStatus;
	ingested_at: string;
	updated_at: string;
	source_urls: string[];
	attachment_paths: string[];
}

interface ProjectNode {
	id: string;
	name?: string;
	project_id?: string;
	node_type?: string;
}

const OUTPUT_SPECS: { key: IntakeOutputKey; title: string }[] = [
	{ key: "01-key-insights", title: "Key Insights" },
	{ key: "02-confirmed-facts", title: "Confirmed Facts" },
	{ key: "03-open-questions", title: "Open Questions" },
	{ key: "04-product-implications", title: "Product Implications" },
	{ key: "05-domain-knowledge", title: "Domain Knowledge" },
	{ key: "06-strategy-signals", title: "Strategy Signals" },
	{ key: "07-lessons-candidates", title: "Lessons Candidates" },
	{ key: "08-propagation-targets", title: "Propagation Targets" },
];

const METADATA_FILE = "intake.json";
const RAW_INPUT_FILE = "raw-input.md";
const DIALOGUE_FILE = "dialogue.jsonl";
const SUMMARY_FILE = "SUMMARY.md";
const PROPAGATION_PLAN_FILE = "PROPAGATION-PLAN.md";
const PROPAGATION_RECEIPT_FILE = "propagation-receipt.json";

const FORBIDDEN_PROPAGATION_PATTERNS = [
	/^projects\/_shared\/foundations\//,
	/^projects\/[^/]+\/foundations\//,
	/^projects\/[^/]+\/[^/]+\/foundations\//,
	/^work-orders\//,
	/^docs\/brand\//,
];

const nowIso = () => new Date().toISOString();

const normalizeSlashes = (value: string) => value.replace(/\\/g, "/");

const slugify = (value: string) => {
	const slug = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
	return slug || `intake-${Date.now()}`;
};

const safeSegment = (value: string) => slugify(value).replace(/\./g, "-");

const stableIdPart = (value: string) =>
	createHash("sha1").update(value).digest("hex").slice(0, 10);

const makeIntakeId = (projectId: string, intakeRelativePath: string) =>
	`${projectId}::${normalizeSlashes(intakeRelativePath)}`;

const parseIntakeId = (intakeId: string) => {
	const separatorIndex = intakeId.indexOf("::");
	if (separatorIndex < 1) {
		throw new Error(`Invalid intake id: ${intakeId}`);
	}

	return {
		projectId: intakeId.slice(0, separatorIndex),
		intakeRelativePath: intakeId.slice(separatorIndex + 2),
	};
};

const projectSegments = (projectId: string) =>
	normalizeSlashes(projectId)
		.split("/")
		.filter(Boolean)
		.map((segment) => {
			const sanitized = segment.replace(/[^a-zA-Z0-9._-]/g, "-");
			if (!sanitized || sanitized === "." || sanitized === "..") {
				throw new Error(`Invalid project id segment: ${segment}`);
			}
			return sanitized;
		});

const isInsidePath = (base: string, candidate: string) => {
	const relative = path.relative(base, candidate);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const resolveInside = (base: string, relativePath: string) => {
	const candidate = path.resolve(base, relativePath);
	if (!isInsidePath(base, candidate)) {
		throw new Error(`Path escapes factory root: ${relativePath}`);
	}
	return candidate;
};

const readText = async (filePath: string) => {
	try {
		return await readFile(filePath, "utf8");
	} catch {
		return "";
	}
};

const readJson = async <T>(filePath: string): Promise<T | undefined> => {
	const raw = await readText(filePath);
	if (!raw.trim()) {
		return undefined;
	}

	try {
		return JSON.parse(raw) as T;
	} catch {
		return undefined;
	}
};

const writeJson = async (filePath: string, value: unknown) => {
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const findFactoryRoot = () => {
	let current = process.cwd();
	for (let index = 0; index < 10; index += 1) {
		if (
			existsSync(path.join(current, "projects")) &&
			existsSync(path.join(current, "work-orders"))
		) {
			return current;
		}
		const parent = path.dirname(current);
		if (parent === current) {
			break;
		}
		current = parent;
	}

	const envRoot = process.env.FACTORY_ROOT;
	if (envRoot) {
		return path.resolve(envRoot);
	}

	throw new Error("Unable to locate Software Factory root");
};

const projectPath = (root: string, projectId: string) =>
	path.join(root, "projects", ...projectSegments(projectId));

const intakeRootPath = (root: string, projectId: string) =>
	path.join(projectPath(root, projectId), "intake");

const intakeTypeFolder = (type: string) => {
	const normalized = slugify(type);
	const map: Record<string, string> = {
		workshop: "workshops",
		workshops: "workshops",
		article: "articles",
		articles: "articles",
		"customer-pain": "customer-pain-interviews",
		"customer-pain-interview": "customer-pain-interviews",
		"competitor-news": "competitor-news",
		"design-reference": "design-references",
		"industry-report": "industry-reports",
		"advisor-conversation": "advisor-conversations",
		"founder-brain-dump": "founder-brain-dumps",
		"code-reference": "code-references",
	};
	return map[normalized] || `${normalized}s`;
};

const outputFileName = (key: IntakeOutputKey) => `${key}.md`;

const statusFromText = (value: string): IntakeStatus => {
	const normalized = value.trim().toLowerCase();
	if (
		normalized === "digesting" ||
		normalized === "digested" ||
		normalized === "propagated" ||
		normalized === "shelved" ||
		normalized === "declined"
	) {
		return normalized;
	}
	return "pending";
};

const typeFromHeading = (heading: string) => {
	const normalized = slugify(heading);
	const map: Record<string, string> = {
		workshops: "workshop",
		articles: "article",
		"customer-pain-interviews": "customer-pain",
		"competitor-news": "competitor-news",
		"design-references": "design-reference",
		"industry-reports": "industry-report",
		"advisor-conversations": "advisor-conversation",
		"founder-brain-dumps": "founder-brain-dump",
		"code-references": "code-reference",
	};
	return map[normalized] || normalized;
};

const parseTableRow = (line: string) =>
	line
		.trim()
		.replace(/^\||\|$/g, "")
		.split("|")
		.map((cell) => cell.trim());

const looksLikeEmptyInventoryRow = (cells: string[]) =>
	cells.some((cell) => cell.toLowerCase().includes("(none yet)"));

const parseProjectHierarchy = async (root: string): Promise<ProjectNode[]> => {
	const hierarchyPath = path.join(root, "projects", "project-hierarchy.yml");
	const content = await readText(hierarchyPath);
	const nodes: ProjectNode[] = [];
	const lines = content.split(/\r?\n/);

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		const idMatch = line.match(/^\s*-\s+id:\s*("?)([^"#]+)\1\s*(?:#.*)?$/);
		if (!idMatch) {
			continue;
		}

		const baseIndent = line.search(/\S/);
		const node: ProjectNode = { id: idMatch[2].trim() };

		for (let childIndex = index + 1; childIndex < lines.length; childIndex += 1) {
			const childLine = lines[childIndex];
			if (!childLine.trim()) {
				continue;
			}
			const childIndent = childLine.search(/\S/);
			if (childIndent <= baseIndent && childLine.trimStart().startsWith("- id:")) {
				break;
			}
			const propertyMatch = childLine.match(/^\s+([a-zA-Z0-9_-]+):\s*(.*)$/);
			if (!propertyMatch) {
				continue;
			}
			const key = propertyMatch[1];
			const rawValue = propertyMatch[2].replace(/\s+#.*$/, "").trim();
			const value = rawValue.replace(/^["']|["']$/g, "");
			if (key === "name") {
				node.name = value;
			}
			if (key === "project_id") {
				node.project_id = value;
			}
			if (key === "node_type") {
				node.node_type = value;
			}
		}

		nodes.push(node);
	}

	return nodes;
};

const projectIdsFromHierarchy = async (root: string) => {
	const nodes = await parseProjectHierarchy(root);
	const selectable = nodes
		.filter((node) => node.project_id)
		.filter((node) =>
			node.node_type
				? ["factory_infrastructure", "product", "organization"].includes(node.node_type)
				: true,
		)
		.map((node) => node.project_id as string);

	return [...new Set(selectable)];
};

const discoverProjectIds = async (root: string) => {
	const hierarchyIds = await projectIdsFromHierarchy(root);
	if (hierarchyIds.length > 0) {
		return hierarchyIds;
	}

	const projectsDir = path.join(root, "projects");
	const ids: string[] = [];
	const walk = async (dir: string, relativeParts: string[]) => {
		const entries = await readdir(dir, { withFileTypes: true });
		if (entries.some((entry) => entry.name === "project-pipeline.yml")) {
			ids.push(relativeParts.join("/"));
		}
		for (const entry of entries) {
			if (entry.isDirectory() && !entry.name.startsWith(".")) {
				await walk(path.join(dir, entry.name), [...relativeParts, entry.name]);
			}
		}
	};

	if (existsSync(projectsDir)) {
		await walk(projectsDir, []);
	}

	return ids;
};

const parseInventoryRows = async (root: string, projectId: string) => {
	const inventoryPath = path.join(intakeRootPath(root, projectId), "INVENTORY.md");
	const content = await readText(inventoryPath);
	if (!content.trim()) {
		return [];
	}

	const rows: {
		type: string;
		title: string;
		status: IntakeStatus;
		folderRelativePath: string;
		ingestedAt?: string;
		inventoryPath: string;
	}[] = [];
	let currentType = "intake";
	let headers: string[] = [];

	for (const line of content.split(/\r?\n/)) {
		const headingMatch = line.match(/^##\s+(.+)$/);
		if (headingMatch) {
			currentType = typeFromHeading(headingMatch[1]);
			headers = [];
			continue;
		}

		if (!line.trim().startsWith("|")) {
			continue;
		}

		const cells = parseTableRow(line);
		if (cells.length < 3 || cells.every((cell) => /^-+$/.test(cell))) {
			continue;
		}

		if (headers.length === 0) {
			headers = cells.map((cell) => slugify(cell));
			continue;
		}

		if (looksLikeEmptyInventoryRow(cells)) {
			continue;
		}

		const valueFor = (header: string) => {
			const index = headers.findIndex((candidate) => candidate === slugify(header));
			return index >= 0 ? cells[index] || "" : "";
		};

		const folder = valueFor("folder");
		if (!folder) {
			continue;
		}

		const title =
			valueFor("title") ||
			valueFor("topic") ||
			valueFor("person-role") ||
			valueFor("competitor") ||
			valueFor("reference") ||
			path.basename(folder);
		const status = statusFromText(valueFor("status"));
		const ingestedAt = valueFor("ingested") || valueFor("date") || undefined;
		const folderRelativePath = folder.startsWith("projects/")
			? normalizeSlashes(path.relative(intakeRootPath(root, projectId), path.join(root, folder)))
			: normalizeSlashes(folder);

		rows.push({
			type: currentType,
			title,
			status,
			folderRelativePath,
			ingestedAt,
			inventoryPath,
		});
	}

	return rows;
};

const recursivelyFindMetadata = async (dir: string, depth = 0): Promise<string[]> => {
	if (depth > 4 || !existsSync(dir)) {
		return [];
	}

	const entries = await readdir(dir, { withFileTypes: true });
	const matches: string[] = [];
	for (const entry of entries) {
		const entryPath = path.join(dir, entry.name);
		if (entry.isFile() && entry.name === METADATA_FILE) {
			matches.push(entryPath);
		} else if (entry.isDirectory() && !entry.name.startsWith(".")) {
			matches.push(...(await recursivelyFindMetadata(entryPath, depth + 1)));
		}
	}
	return matches;
};

const listOutputFiles = async (folderPath: string): Promise<IntakeOutput[]> => {
	const outputs: IntakeOutput[] = [];
	for (const spec of OUTPUT_SPECS) {
		const outputPath = path.join(folderPath, outputFileName(spec.key));
		const content = await readText(outputPath);
		if (content.trim()) {
			outputs.push({
				key: spec.key,
				title: spec.title,
				path: outputPath,
				content,
			});
		}
	}
	return outputs;
};

const parseDialogueJsonl = async (
	dialoguePath: string,
): Promise<IntakeDialogueMessage[]> => {
	const content = await readText(dialoguePath);
	return content
		.split(/\r?\n/)
		.filter((line) => line.trim())
		.map((line) => {
			try {
				return JSON.parse(line) as IntakeDialogueMessage;
			} catch {
				return undefined;
			}
		})
		.filter((message): message is IntakeDialogueMessage => Boolean(message));
};

const appendDialogueMessage = async (
	dialoguePath: string,
	message: IntakeDialogueMessage,
) => {
	await mkdir(path.dirname(dialoguePath), { recursive: true });
	await appendFile(dialoguePath, `${JSON.stringify(message)}\n`, "utf8");
};

const extractJsonObject = (text: string) => {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidate = fenced?.[1] || text;
	const objectMatch = candidate.match(/\{[\s\S]*\}/);
	if (!objectMatch) {
		return undefined;
	}

	try {
		return JSON.parse(objectMatch[0]) as Record<string, unknown>;
	} catch {
		return undefined;
	}
};

const parseDigestSections = (text: string): Partial<Record<IntakeOutputKey, string>> => {
	const sections: Partial<Record<IntakeOutputKey, string>> = {};
	for (const spec of OUTPUT_SPECS) {
		const heading = spec.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const match = text.match(
			new RegExp(`(?:^|\\n)#+\\s*${heading}\\s*\\n([\\s\\S]*?)(?=\\n#+\\s*\\d{2}-|$)`, "i"),
		);
		if (match) {
			sections[spec.key] = match[1].trim();
		}
	}

	if (Object.keys(sections).length === 0 && text.trim()) {
		sections["01-key-insights"] = text.trim();
	}

	return sections;
};

const renderOutputDocument = (
	spec: { key: IntakeOutputKey; title: string },
	content: string,
	item: IntakeListItem,
) => `# ${spec.title}

Source intake: \`${item.folder_relative_path}\`
Project: \`${item.project_id}\`
Status: \`${item.status}\`

${content.trim() || "TKTK - INTAKE_STEWARD did not produce content for this section."}
`;

const parsePropagationTargets = (content: string): IntakePropagationTarget[] => {
	const targets: IntakePropagationTarget[] = [];
	const targetPattern = /`([^`]+\.(?:md|yml|yaml|json|jsonl|txt))`/g;
	for (const match of content.matchAll(targetPattern)) {
		targets.push({ path: normalizeSlashes(match[1]), status: "candidate" });
	}

	for (const line of content.split(/\r?\n/)) {
		const targetMatch = line.match(/target(?:_path)?:\s*([^\s]+)/i);
		if (targetMatch) {
			targets.push({ path: normalizeSlashes(targetMatch[1]), status: "candidate" });
		}
	}

	const deduped = new Map<string, IntakePropagationTarget>();
	for (const target of targets) {
		if (!deduped.has(target.path)) {
			deduped.set(target.path, target);
		}
	}
	return [...deduped.values()];
};

const isForbiddenPropagationPath = (relativePath: string) => {
	const normalized = normalizeSlashes(relativePath).replace(/^\/+/, "");
	return FORBIDDEN_PROPAGATION_PATTERNS.some((pattern) => pattern.test(normalized));
};

const sourceTextForPrompt = async (folderPath: string) => {
	const rawInput = await readText(path.join(folderPath, RAW_INPUT_FILE));
	if (rawInput.trim()) {
		return rawInput;
	}

	const summary = await readText(path.join(folderPath, SUMMARY_FILE));
	if (summary.trim()) {
		return summary;
	}

	return `No raw-input.md or SUMMARY.md exists yet for ${folderPath}.`;
};

const readProjectFoundations = async (root: string, projectId: string) => {
	const foundations: { label: string; sourcePath: string; content: string }[] = [];
	const sharedIndex = path.join(root, "projects", "_shared", "foundations", "intake-protocol.md");
	const sharedContent = await readText(sharedIndex);
	if (sharedContent.trim()) {
		foundations.push({
			label: "Shared Intake Protocol",
			sourcePath: normalizeSlashes(path.relative(root, sharedIndex)),
			content: sharedContent.slice(0, 12000),
		});
	}

	const foundationsDir = path.join(projectPath(root, projectId), "foundations");
	if (existsSync(foundationsDir)) {
		const entries = await readdir(foundationsDir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isFile() && entry.name.endsWith(".md")) {
				const filePath = path.join(foundationsDir, entry.name);
				const content = await readText(filePath);
				foundations.push({
					label: entry.name.replace(/\.md$/, ""),
					sourcePath: normalizeSlashes(path.relative(root, filePath)),
					content: content.slice(0, 12000),
				});
			}
		}
	}

	return foundations;
};

export class FactoryIntakeStore {
	private readonly root: string;

	constructor(options: IntakeStoreOptions = {}) {
		this.root = path.resolve(options.root || findFactoryRoot());
	}

	async list(input: IntakeListInput = {}): Promise<IntakeListItem[]> {
		const projectIds = input.project_id ? [input.project_id] : await discoverProjectIds(this.root);
		const items: IntakeListItem[] = [];

		for (const projectId of projectIds) {
			const intakeRoot = intakeRootPath(this.root, projectId);
			const inventoryRows = await parseInventoryRows(this.root, projectId);

			for (const row of inventoryRows) {
				const folderPath = resolveInside(intakeRoot, row.folderRelativePath);
				const metadata = await this.readMetadata(folderPath);
				items.push(
					await this.makeListItem({
						projectId,
						folderPath,
						type: metadata?.type || row.type,
						title: metadata?.title || row.title,
						status: metadata?.status || row.status,
						ingestedAt: metadata?.ingested_at || row.ingestedAt,
						inventoryPath: row.inventoryPath,
					}),
				);
			}

			for (const metadataPath of await recursivelyFindMetadata(intakeRoot)) {
				const folderPath = path.dirname(metadataPath);
				const metadata = await this.readMetadata(folderPath);
				if (!metadata) {
					continue;
				}
				const alreadyListed = items.some(
					(item) => path.resolve(item.folder_path) === path.resolve(folderPath),
				);
				if (!alreadyListed) {
					items.push(
						await this.makeListItem({
							projectId: metadata.project_id || projectId,
							folderPath,
							type: metadata.type,
							title: metadata.title,
							status: metadata.status,
							ingestedAt: metadata.ingested_at,
						}),
					);
				}
			}
		}

		const filtered = items.filter((item) => {
			if (!input.include_propagated && item.status === "propagated") {
				return false;
			}
			if (input.status && input.status !== "all" && item.status !== input.status) {
				return false;
			}
			if (input.type && item.type !== input.type) {
				return false;
			}
			if (input.search) {
				const needle = input.search.toLowerCase();
				const haystack = `${item.title} ${item.project_id} ${item.type} ${item.folder_relative_path}`.toLowerCase();
				if (!haystack.includes(needle)) {
					return false;
				}
			}
			return true;
		});

		return filtered.sort((left, right) =>
			(right.last_activity_at || right.ingested_at || "").localeCompare(
				left.last_activity_at || left.ingested_at || "",
			),
		);
	}

	async get(intakeId: string): Promise<IntakeBundle> {
		const item = await this.getItem(intakeId);
		const folderPath = item.folder_path;
		const outputs = await listOutputFiles(folderPath);
		const summary = await readText(path.join(folderPath, SUMMARY_FILE));
		const propagationPlan = await readText(path.join(folderPath, PROPAGATION_PLAN_FILE));
		const dialogue = await parseDialogueJsonl(path.join(folderPath, DIALOGUE_FILE));
		const entries = existsSync(folderPath)
			? await readdir(folderPath, { withFileTypes: true })
			: [];
		const receipts = entries
			.filter((entry) => entry.isFile() && entry.name.toLowerCase().includes("receipt"))
			.map((entry) => path.join(folderPath, entry.name));
		const attachmentIndex = await readJson<{ paths: string[] }>(
			path.join(folderPath, "attachments", "index.json"),
		);
		const attachments = attachmentIndex?.paths || [];

		return {
			item,
			raw_input: await sourceTextForPrompt(folderPath),
			summary: summary.trim() ? summary : undefined,
			outputs,
			propagation_plan: propagationPlan.trim() ? propagationPlan : undefined,
			propagation_targets: parsePropagationTargets(propagationPlan),
			dialogue,
			receipts,
			attachments,
		};
	}

	async createDraft(input: IntakeCreateDraftInput): Promise<IntakeBundle> {
		const projectId = input.project_id || "software-factory";
		const type = input.type || "founder-brain-dump";
		const title = input.title?.trim() || "Untitled intake";
		const slug = safeSegment(input.slug || title);
		const intakeRoot = intakeRootPath(this.root, projectId);
		const folder = await this.nextDraftFolder(intakeRoot, type, slug);
		const folderPath = resolveInside(intakeRoot, folder);
		await mkdir(folderPath, { recursive: true });

		const sourceUrls = input.source_urls || [];
		const attachmentPaths = input.attachment_paths || [];
		const attachmentReferences = attachmentPaths.map((attachmentPath) =>
			normalizeSlashes(path.resolve(attachmentPath)),
		);

		const rawInput = `# ${title}

Created: ${nowIso()}
Project: \`${projectId}\`
Type: \`${type}\`

## Operator Input

${input.operator_text?.trim() || "TKTK - operator input not provided."}

## Source URLs

${sourceUrls.map((url) => `- ${url}`).join("\n") || "- none"}

## Attachments

${attachmentReferences.map((filePath) => `- ${filePath}`).join("\n") || "- none"}
`;

		await writeFile(path.join(folderPath, RAW_INPUT_FILE), rawInput, "utf8");
		await writeJson(path.join(folderPath, "attachments", "index.json"), {
			paths: attachmentReferences,
			storage_mode: "filesystem-reference",
			note: "Layer 2 intake stores local file path references only; no upload or copy is performed.",
		});

		const timestamp = nowIso();
		await this.writeMetadata(folderPath, {
			project_id: projectId,
			type,
			title,
			slug,
			status: "pending",
			ingested_at: timestamp,
			updated_at: timestamp,
			source_urls: sourceUrls,
			attachment_paths: attachmentReferences,
		});

		await this.ensureInventoryRow(projectId, type, title, "pending", folder);
		return this.get(makeIntakeId(projectId, folder));
	}

	async classify(intakeId: string): Promise<IntakeClassificationResult> {
		const bundle = await this.get(intakeId);
		const prompt = buildIntakeClassificationPrompt({
			title: bundle.item.title,
			projectId: bundle.item.project_id,
			rawInput: bundle.raw_input,
			attachmentPaths: bundle.attachments,
		});
		const result = await invokeFactoryCliRole({
			provider: "claude",
			roleId: "INTAKE_STEWARD",
			dialogueId: randomUUID(),
			prompt,
		});

		const parsed = extractJsonObject(result.text);
		const classification: IntakeClassificationResult = {
			intake_id: intakeId,
			intake_type:
				typeof parsed?.intake_type === "string"
					? parsed.intake_type
					: bundle.item.type,
			title: typeof parsed?.title === "string" ? parsed.title : bundle.item.title,
			slug: typeof parsed?.slug === "string" ? parsed.slug : bundle.item.slug,
			project_id:
				typeof parsed?.project_id === "string"
					? parsed.project_id
					: bundle.item.project_id,
			confidence:
				typeof parsed?.confidence === "number" ? parsed.confidence : 0.5,
			reason: typeof parsed?.reason === "string" ? parsed.reason : "Parsed from CLI response.",
			raw_response: result.text,
		};

		return classification;
	}

	async confirmClassification(input: {
		intake_id: string;
		project_id: string;
		type: string;
		title: string;
		slug: string;
	}): Promise<IntakeBundle> {
		const bundle = await this.get(input.intake_id);
		const currentFolder = bundle.item.folder_path;
		const nextProjectId = input.project_id || bundle.item.project_id;
		const nextFolderRelative = await this.nextDraftFolder(
			intakeRootPath(this.root, nextProjectId),
			input.type,
			safeSegment(input.slug || input.title),
			true,
		);
		const nextFolder = resolveInside(intakeRootPath(this.root, nextProjectId), nextFolderRelative);

		if (path.resolve(currentFolder) !== path.resolve(nextFolder)) {
			await mkdir(path.dirname(nextFolder), { recursive: true });
			await rename(currentFolder, nextFolder);
		}

		const metadata = await this.readMetadata(nextFolder);
		const timestamp = nowIso();
		await this.writeMetadata(nextFolder, {
			project_id: nextProjectId,
			type: input.type,
			title: input.title,
			slug: safeSegment(input.slug || input.title),
			status: "digesting",
			ingested_at: metadata?.ingested_at || timestamp,
			updated_at: timestamp,
			source_urls: metadata?.source_urls || [],
			attachment_paths: metadata?.attachment_paths || [],
		});
		await this.ensureInventoryRow(
			nextProjectId,
			input.type,
			input.title,
			"digesting",
			nextFolderRelative,
		);

		return this.get(makeIntakeId(nextProjectId, nextFolderRelative));
	}

	async runDigest(
		intakeId: string,
		onEvent?: (event: IntakeStreamEvent) => void,
		signal?: AbortSignal,
	): Promise<IntakeBundle> {
		const bundle = await this.get(intakeId);
		await this.updateStatus(bundle.item, "digesting");
		onEvent?.({ type: "status", message: "INTAKE_STEWARD digest started" });

		const prompt = buildIntakeDigestPrompt(await this.promptSource(bundle));
		const result = await invokeFactoryCliRole({
			provider: "claude",
			roleId: "INTAKE_STEWARD",
			dialogueId: randomUUID(),
			prompt,
			signal,
			onChunk: (chunk) => onEvent?.({ type: "chunk", chunk }),
		});

		await this.writeDigestOutputs(bundle.item, result.text);
		await this.updateStatus(bundle.item, "digested");
		const updated = await this.get(intakeId);
		onEvent?.({ type: "complete", message: "Digest complete", bundle: updated });
		return updated;
	}

	async submitDialogueTurn(
		input: {
			intake_id: string;
			message: string;
		},
		onEvent?: (event: IntakeStreamEvent) => void,
		signal?: AbortSignal,
	): Promise<IntakeDialogueMessage> {
		const bundle = await this.get(input.intake_id);
		await this.appendDialogue(bundle.item, {
			speaker: "operator",
			content: input.message,
		});
		onEvent?.({ type: "status", message: "INTAKE_STEWARD is thinking" });

		const source = await this.promptSource(await this.get(input.intake_id));
		const prompt = buildIntakeDialoguePrompt({
			...source,
			operatorMessage: input.message,
		});
		const chunks: string[] = [];
		const result = await invokeFactoryCliRole({
			provider: "claude",
			roleId: "INTAKE_STEWARD",
			dialogueId: randomUUID(),
			prompt,
			signal,
			onChunk: (chunk) => {
				chunks.push(chunk);
				onEvent?.({ type: "chunk", chunk });
			},
		});

		const message = await this.appendDialogue(bundle.item, {
			speaker: "agent",
			role_id: "INTAKE_STEWARD",
			content: result.text || chunks.join(""),
		});
		onEvent?.({ type: "complete", message: "Dialogue turn complete" });
		return message;
	}

	async revisePlan(input: { intake_id: string; revision: string }): Promise<IntakeBundle> {
		const bundle = await this.get(input.intake_id);
		const planPath = path.join(bundle.item.folder_path, PROPAGATION_PLAN_FILE);
		const current = await readText(planPath);
		const next = `${current.trim() || "# Propagation Plan"}\n\n## Operator Revision ${nowIso()}\n\n${input.revision.trim()}\n`;
		await writeFile(planPath, next, "utf8");
		await this.appendDialogue(bundle.item, {
			speaker: "operator",
			content: `Propagation plan revision:\n\n${input.revision}`,
		});
		return this.get(input.intake_id);
	}

	async commitPropagation(input: {
		intake_id: string;
		operator_reason?: string;
	}): Promise<{ bundle: IntakeBundle; receiptPath: string; appliedTargets: string[] }> {
		const bundle = await this.get(input.intake_id);
		const plan = bundle.propagation_plan || "";
		const targets = parsePropagationTargets(plan);
		if (targets.length === 0) {
			throw new Error("No propagation targets found in PROPAGATION-PLAN.md");
		}

		for (const target of targets) {
			const normalized = normalizeSlashes(target.path).replace(/^\/+/, "");
			if (isForbiddenPropagationPath(normalized)) {
				throw new Error(`Forbidden Chunk 2 propagation target: ${normalized}`);
			}
			resolveInside(this.root, normalized);
		}

		const prompt = buildIntakePropagationPrompt({
			...(await this.promptSource(bundle)),
			proposedTargets: targets.map((target) => target.path),
		});
		const review = await invokeFactoryCliRole({
			provider: "claude",
			roleId: "INTAKE_STEWARD",
			dialogueId: randomUUID(),
			prompt,
		});

		const stagingDir = path.join(bundle.item.folder_path, `.propagation-staging-${Date.now()}`);
		await mkdir(stagingDir, { recursive: true });
		const appliedTargets: string[] = [];
		const backups: { path: string; existed: boolean; content?: string }[] = [];
		try {
			for (const target of targets) {
				const normalized = normalizeSlashes(target.path).replace(/^\/+/, "");
				const finalPath = resolveInside(this.root, normalized);
				const stagedPath = path.join(stagingDir, stableIdPart(normalized));
				const content = target.content?.trim()
					? target.content
					: this.defaultPropagationContent(bundle, normalized, review.text);
				await writeFile(stagedPath, content, "utf8");
				backups.push({
					path: finalPath,
					existed: existsSync(finalPath),
					content: existsSync(finalPath) ? await readFile(finalPath, "utf8") : undefined,
				});
			}

			for (const target of targets) {
				const normalized = normalizeSlashes(target.path).replace(/^\/+/, "");
				const finalPath = resolveInside(this.root, normalized);
				const stagedPath = path.join(stagingDir, stableIdPart(normalized));
				await mkdir(path.dirname(finalPath), { recursive: true });
				if (existsSync(finalPath)) {
					await rm(finalPath, { force: true });
				}
				await rename(stagedPath, finalPath);
				appliedTargets.push(normalized);
			}
		} catch (error) {
			for (const backup of backups.reverse()) {
				if (backup.existed && backup.content !== undefined) {
					await mkdir(path.dirname(backup.path), { recursive: true });
					await writeFile(backup.path, backup.content, "utf8");
				} else if (!backup.existed && existsSync(backup.path)) {
					await rm(backup.path, { force: true });
				}
			}
			throw new Error(
				`Atomic propagation failed before all targets were applied: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		} finally {
			await rm(stagingDir, { recursive: true, force: true });
		}

		await this.updateStatus(bundle.item, "propagated");
		const receipt = {
			intake_id: input.intake_id,
			project_id: bundle.item.project_id,
			applied_at: nowIso(),
			operator_reason: input.operator_reason || "",
			targets: appliedTargets,
			review: review.text,
		};
		const receiptPath = path.join(bundle.item.folder_path, PROPAGATION_RECEIPT_FILE);
		await writeJson(receiptPath, receipt);
		const updated = await this.get(input.intake_id);
		return { bundle: updated, receiptPath, appliedTargets };
	}

	async getDialogue(intakeId: string): Promise<IntakeDialogueMessage[]> {
		const bundle = await this.get(intakeId);
		return bundle.dialogue;
	}

	private async makeListItem(input: {
		projectId: string;
		folderPath: string;
		type: string;
		title: string;
		status: IntakeStatus;
		ingestedAt?: string;
		inventoryPath?: string;
	}): Promise<IntakeListItem> {
		const metadata = await this.readMetadata(input.folderPath);
		const relativeToIntakeRoot = normalizeSlashes(
			path.relative(intakeRootPath(this.root, input.projectId), input.folderPath),
		);
		const stats = existsSync(input.folderPath)
			? await stat(input.folderPath)
			: undefined;
		const summary = await readText(path.join(input.folderPath, SUMMARY_FILE));
		const plan = await readText(path.join(input.folderPath, PROPAGATION_PLAN_FILE));

		return {
			id: makeIntakeId(input.projectId, relativeToIntakeRoot),
			project_id: input.projectId,
			type: metadata?.type || input.type,
			title: metadata?.title || input.title,
			slug: metadata?.slug || safeSegment(input.title),
			status: metadata?.status || input.status,
			folder_path: input.folderPath,
			folder_relative_path: normalizeSlashes(
				path.relative(this.root, input.folderPath),
			),
			inventory_path: input.inventoryPath,
			summary_preview: summary.trim().slice(0, 280) || undefined,
			ingested_at: metadata?.ingested_at || input.ingestedAt,
			last_activity_at: metadata?.updated_at || stats?.mtime.toISOString(),
			propagation_target_count: parsePropagationTargets(plan).length,
		};
	}

	private async getItem(intakeId: string): Promise<IntakeListItem> {
		const { projectId, intakeRelativePath } = parseIntakeId(intakeId);
		const folderPath = resolveInside(intakeRootPath(this.root, projectId), intakeRelativePath);
		const metadata = await this.readMetadata(folderPath);
		if (metadata) {
			return this.makeListItem({
				projectId,
				folderPath,
				type: metadata.type,
				title: metadata.title,
				status: metadata.status,
				ingestedAt: metadata.ingested_at,
			});
		}

		const list = await this.list({ project_id: projectId, include_propagated: true });
		const found = list.find((item) => item.id === intakeId);
		if (!found) {
			throw new Error(`Intake not found: ${intakeId}`);
		}
		return found;
	}

	private async readMetadata(folderPath: string) {
		return readJson<IntakeMetadata>(path.join(folderPath, METADATA_FILE));
	}

	private async writeMetadata(folderPath: string, metadata: IntakeMetadata) {
		await writeJson(path.join(folderPath, METADATA_FILE), metadata);
	}

	private async updateStatus(item: IntakeListItem, status: IntakeStatus) {
		const metadata = await this.readMetadata(item.folder_path);
		const timestamp = nowIso();
		await this.writeMetadata(item.folder_path, {
			project_id: item.project_id,
			type: item.type,
			title: item.title,
			slug: item.slug,
			status,
			ingested_at: metadata?.ingested_at || item.ingested_at || timestamp,
			updated_at: timestamp,
			source_urls: metadata?.source_urls || [],
			attachment_paths: metadata?.attachment_paths || [],
		});
		await this.rewriteInventoryStatus(item, status);
	}

	private async nextDraftFolder(
		intakeRoot: string,
		type: string,
		slug: string,
		allowExact = false,
	) {
		const typeFolder = intakeTypeFolder(type);
		const prefix =
			typeFolder === "workshops"
				? `${String(await this.nextIndex(path.join(intakeRoot, typeFolder))).padStart(2, "0")}-`
				: "";
		const suffix = typeFolder === "workshops" ? "" : `-${nowIso().slice(0, 10)}`;
		const base = normalizeSlashes(path.join(typeFolder, `${prefix}${slug}${suffix}`));
		if (allowExact || !existsSync(path.join(intakeRoot, base))) {
			return base;
		}
		return normalizeSlashes(path.join(typeFolder, `${prefix}${slug}-${Date.now()}`));
	}

	private async nextIndex(folderPath: string) {
		if (!existsSync(folderPath)) {
			return 1;
		}
		const entries = await readdir(folderPath, { withFileTypes: true });
		const numbers = entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => Number(entry.name.match(/^(\d+)/)?.[1] || "0"))
			.filter((value) => value > 0);
		return numbers.length ? Math.max(...numbers) + 1 : 1;
	}

	private async ensureInventoryRow(
		projectId: string,
		type: string,
		title: string,
		status: IntakeStatus,
		folderRelativePath: string,
	) {
		const inventoryPath = path.join(intakeRootPath(this.root, projectId), "INVENTORY.md");
		await mkdir(path.dirname(inventoryPath), { recursive: true });
		const typeHeading = this.inventoryHeading(type);
		const row = `| ${Date.now()} | ${title} |  | ${status} | ${normalizeSlashes(folderRelativePath)} | ${nowIso().slice(0, 10)} |`;
		const content = await readText(inventoryPath);
		if (!content.trim()) {
			await writeFile(
				inventoryPath,
				`# Intake Inventory\n\n## ${typeHeading}\n\n| # | Title | Source | Status | Folder | Ingested |\n|---|-------|--------|--------|--------|----------|\n${row}\n`,
				"utf8",
			);
			return;
		}

		if (!content.includes(`## ${typeHeading}`)) {
			await writeFile(
				inventoryPath,
				`${content.trim()}\n\n## ${typeHeading}\n\n| # | Title | Source | Status | Folder | Ingested |\n|---|-------|--------|--------|--------|----------|\n${row}\n`,
				"utf8",
			);
			return;
		}

		if (content.includes(folderRelativePath)) {
			return;
		}

		const lines = content.split(/\r?\n/);
		const headingIndex = lines.findIndex((line) => line.trim() === `## ${typeHeading}`);
		let insertIndex = headingIndex + 1;
		for (let index = headingIndex + 1; index < lines.length; index += 1) {
			if (lines[index].startsWith("## ")) {
				break;
			}
			if (lines[index].startsWith("|")) {
				insertIndex = index + 1;
			}
		}
		lines.splice(insertIndex, 0, row);
		await writeFile(inventoryPath, `${lines.join("\n")}\n`, "utf8");
	}

	private async rewriteInventoryStatus(item: IntakeListItem, status: IntakeStatus) {
		const inventoryPath =
			item.inventory_path || path.join(intakeRootPath(this.root, item.project_id), "INVENTORY.md");
		const content = await readText(inventoryPath);
		if (!content.trim()) {
			return;
		}

		const folderToken = normalizeSlashes(
			path.relative(intakeRootPath(this.root, item.project_id), item.folder_path),
		);
		const lines = content.split(/\r?\n/).map((line) => {
			if (!line.includes(folderToken) || !line.trim().startsWith("|")) {
				return line;
			}
			const cells = parseTableRow(line);
			const statusIndex = cells.findIndex(
				(cell) =>
					["pending", "digesting", "digested", "propagated", "shelved", "declined"].includes(
						cell.toLowerCase(),
					),
			);
			if (statusIndex < 0) {
				return line;
			}
			cells[statusIndex] = status;
			return `| ${cells.join(" | ")} |`;
		});
		await writeFile(inventoryPath, `${lines.join("\n")}\n`, "utf8");
	}

	private inventoryHeading(type: string) {
		const folder = intakeTypeFolder(type);
		const words = folder.split("-").map((word) => word[0].toUpperCase() + word.slice(1));
		return words.join(" ");
	}

	private async promptSource(bundle: IntakeBundle) {
		const outputs: Partial<Record<IntakeOutputKey, string>> = {};
		for (const output of bundle.outputs) {
			outputs[output.key] = output.content;
		}

		return {
			title: bundle.item.title,
			projectId: bundle.item.project_id,
			intakeType: bundle.item.type,
			folderPath: bundle.item.folder_relative_path,
			rawInput: bundle.raw_input,
			outputs,
			propagationPlan: bundle.propagation_plan,
			dialogueHistory: bundle.dialogue
				.map((message) => `${message.speaker}${message.role_id ? `/${message.role_id}` : ""}: ${message.content}`)
				.join("\n\n"),
			foundations: await readProjectFoundations(this.root, bundle.item.project_id),
		};
	}

	private async writeDigestOutputs(item: IntakeListItem, response: string) {
		const sections = parseDigestSections(response);
		const tempDir = path.join(item.folder_path, `.digest-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		try {
			for (const spec of OUTPUT_SPECS) {
				const content = renderOutputDocument(spec, sections[spec.key] || "", item);
				await writeFile(path.join(tempDir, outputFileName(spec.key)), content, "utf8");
			}
			await writeFile(
				path.join(tempDir, SUMMARY_FILE),
				`# Intake Summary\n\nSource intake: \`${item.folder_relative_path}\`\n\n${sections["01-key-insights"] || response.slice(0, 2000)}\n`,
				"utf8",
			);
			await writeFile(
				path.join(tempDir, PROPAGATION_PLAN_FILE),
				`# Propagation Plan\n\nSource intake: \`${item.folder_relative_path}\`\n\n## Candidate Targets\n\nTKTK - INTAKE_STEWARD dialogue must confirm propagation targets before commit.\n`,
				"utf8",
			);
			for (const entry of await readdir(tempDir)) {
				const source = path.join(tempDir, entry);
				const destination = path.join(item.folder_path, entry);
				if (existsSync(destination)) {
					await rm(destination, { force: true });
				}
				await rename(source, destination);
			}
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	}

	private async appendDialogue(
		item: IntakeListItem,
		input: {
			speaker: IntakeDialogueMessage["speaker"];
			content: string;
			role_id?: string;
		},
	) {
		const message: IntakeDialogueMessage = {
			id: randomUUID(),
			intake_id: item.id,
			project_id: item.project_id,
			speaker: input.speaker,
			role_id: input.role_id,
			content: input.content,
			created_at: nowIso(),
		};
		await appendDialogueMessage(path.join(item.folder_path, DIALOGUE_FILE), message);
		await this.mirrorDialogueMessage(item, message);
		return message;
	}

	private async mirrorDialogueMessage(
		item: IntakeListItem,
		message: IntakeDialogueMessage,
	) {
		const dialogueDir = path.join(
			this.root,
			"runs",
			"dialogues",
			...projectSegments(item.project_id),
			"intake",
			safeSegment(item.slug || stableIdPart(item.id)),
		);
		await appendDialogueMessage(path.join(dialogueDir, "messages.jsonl"), message);
	}

	private defaultPropagationContent(
		bundle: IntakeBundle,
		targetPath: string,
		reviewText: string,
	) {
		return `# Intake Propagation

Source intake: \`${bundle.item.folder_relative_path}\`
Target: \`${targetPath}\`
Applied: ${nowIso()}

## Operator-Reviewed Context

${bundle.summary || bundle.raw_input}

## INTAKE_STEWARD Review

${reviewText}
`;
	}
}

let singleton: FactoryIntakeStore | undefined;

export const getFactoryIntakeStore = () => {
	if (!singleton) {
		singleton = new FactoryIntakeStore();
	}
	return singleton;
};
