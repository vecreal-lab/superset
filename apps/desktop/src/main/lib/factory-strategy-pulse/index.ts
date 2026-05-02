import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
	appendFile,
	mkdir,
	readFile,
	readdir,
	rm,
	rename,
	stat,
	writeFile,
} from "node:fs/promises";
import path from "node:path";

export type StrategyCandidateStatus =
	| "pending_review"
	| "promoted"
	| "declined"
	| "shelved";

export interface StrategyLedgerCandidate {
	id: string;
	project_id: string;
	lane: string;
	finding: string;
	evidence: string[];
	confidence: string;
	priority: string;
	status: StrategyCandidateStatus;
	source_intake: string;
	source_intake_title: string;
	source_intake_type: string;
	source_ingested_at?: string;
	candidate_path: string;
	candidate_relative_path: string;
	intake_folder_relative_path: string;
	updated_at?: string;
	promoted_at?: string;
	declined_at?: string;
	decline_reason?: string;
	ledger_entry_id?: string;
	ledger_path?: string;
}

export interface StrategyLedgerPromotionPreview {
	candidate: StrategyLedgerCandidate;
	ledger_path: string;
	entry_id: string;
	entry_markdown: string;
	requires_explicit_confirmation: boolean;
	confirmation_prompt?: string;
}

export interface StrategyCandidateActionResult {
	candidate: StrategyLedgerCandidate;
	audit_path: string;
	ledger_path?: string;
	ledger_entry_id?: string;
}

interface StrategyCandidateFileEntry {
	id?: string;
	lane?: string;
	finding?: string;
	evidence?: unknown;
	confidence?: string;
	priority?: string;
	source_intake?: string;
	status?: string;
	updated_at?: string;
	promoted_at?: string;
	declined_at?: string;
	decline_reason?: string;
	ledger_entry_id?: string;
	ledger_path?: string;
}

interface IntakeMetadata {
	project_id?: string;
	type?: string;
	title?: string;
	slug?: string;
	status?: string;
	ingested_at?: string;
	updated_at?: string;
}

interface CandidateFileMatch {
	filePath: string;
	relativePath: string;
	projectId: string;
	intakeFolderPath: string;
	intakeFolderRelativePath: string;
}

const STRATEGY_CANDIDATES_FILE = "strategy-candidates.json";

const nowIso = () => new Date().toISOString();

const normalizeSlashes = (value: string) => value.replace(/\\/g, "/");

const stableId = (value: string) =>
	createHash("sha1").update(value).digest("hex").slice(0, 12);

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

const findFactoryRoot = () => {
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

	const envRoot = process.env.FACTORY_ROOT;
	if (envRoot) {
		return path.resolve(envRoot);
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

const readJson = async <T>(filePath: string): Promise<T | undefined> => {
	const raw = await readText(filePath);
	if (!raw.trim()) return undefined;
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

const evidenceArray = (value: unknown, fallback: string) => {
	if (Array.isArray(value)) {
		const evidence = value
			.map((entry) => String(entry || "").trim())
			.filter(Boolean);
		if (evidence.length > 0) return evidence;
	}
	if (typeof value === "string" && value.trim()) {
		return [value.trim()];
	}
	return [fallback];
};

const statusFromText = (value?: string): StrategyCandidateStatus => {
	const normalized = (value || "pending_review").trim().toLowerCase();
	if (
		normalized === "promoted" ||
		normalized === "declined" ||
		normalized === "shelved"
	) {
		return normalized;
	}
	return "pending_review";
};

const isAmbiguousPromotionLanguage = (value?: string) => {
	if (!value?.trim()) return false;
	const normalized = value.trim().toLowerCase();
	return /^(ok|okay|sure|yes|sounds good|looks good|do it|go ahead|approved)\.?$/.test(
		normalized,
	);
};

const appendOrCreateLedger = (current: string, entry: string) => {
	if (!current.trim()) {
		return `# Strategy Ledger\n\n${entry.trim()}\n`;
	}
	return `${current.trimEnd()}\n\n${entry.trim()}\n`;
};

const canonicalLane = (lane: string) =>
	lane
		.toLowerCase()
		.replace(/&/g, "and")
		.replace(/\+/g, " ")
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "") || "strategy_ledger_candidates";

const priorityForLedger = (priority: string) => {
	const normalized = priority.toLowerCase();
	if (normalized.includes("urgent")) return "urgent_owner_attention";
	if (normalized.includes("high") || normalized.includes("recommended")) {
		return "recommended";
	}
	if (normalized.includes("monitor")) return "monitor";
	return "candidate";
};

export class FactoryStrategyPulseStore {
	private readonly root: string;

	constructor(options: { root?: string } = {}) {
		this.root = path.resolve(options.root || findFactoryRoot());
	}

	async listLedgerCandidates(input: {
		project_id?: string;
		include_resolved?: boolean;
	} = {}): Promise<StrategyLedgerCandidate[]> {
		const matches = await this.findCandidateFiles();
		const rows: StrategyLedgerCandidate[] = [];

		for (const match of matches) {
			if (input.project_id && match.projectId !== input.project_id) continue;
			const rawCandidates =
				(await readJson<StrategyCandidateFileEntry[]>(match.filePath)) || [];
			const metadata = await readJson<IntakeMetadata>(
				path.join(match.intakeFolderPath, "intake.json"),
			);
			const stats = await stat(match.filePath).catch(() => undefined);

			for (const rawCandidate of rawCandidates) {
				const candidate = this.normalizeCandidate(match, rawCandidate, metadata, stats);
				if (!input.include_resolved && candidate.status !== "pending_review") {
					continue;
				}
				rows.push(candidate);
			}
		}

		return rows.sort((a, b) => {
			const statusScore = (candidate: StrategyLedgerCandidate) =>
				candidate.status === "pending_review" ? 0 : 1;
			const statusDelta = statusScore(a) - statusScore(b);
			if (statusDelta !== 0) return statusDelta;
			const confidenceDelta =
				this.confidenceScore(b.confidence) - this.confidenceScore(a.confidence);
			if (confidenceDelta !== 0) return confidenceDelta;
			return String(b.source_ingested_at || b.updated_at || "").localeCompare(
				String(a.source_ingested_at || a.updated_at || ""),
			);
		});
	}

	async buildPromotionPreview(input: {
		candidate_id: string;
		last_operator_message?: string;
	}): Promise<StrategyLedgerPromotionPreview> {
		const candidate = await this.getCandidate(input.candidate_id);
		const timestamp = nowIso();
		const entryId =
			candidate.ledger_entry_id ||
			`ledger-${stableId(`${candidate.id}-${candidate.project_id}`)}`;
		const ledgerPath = this.ledgerPathForCandidate(candidate);
		const evidence = candidate.evidence
			.map((entry) => `  - ${entry}`)
			.join("\n");
		const entry = `## ${entryId}

- id: ${entryId}
- created: ${timestamp}
- project_id: ${candidate.project_id}
- source_run_id: intake:${candidate.source_intake}
- source_work_order_id: WO-C21.6
- lane: ${canonicalLane(candidate.lane)}
- finding: ${candidate.finding}
- evidence:
${evidence}
- confidence: ${candidate.confidence || "medium"}
- priority: ${priorityForLedger(candidate.priority)}
- status: observed
- promotion_rationale: ${input.last_operator_message?.trim() || "Operator promoted this intake-sourced strategic candidate for continued monitoring."}
- owner_question:
- next_review_date: ${this.nextReviewDate()}
`;

		const requiresExplicitConfirmation = isAmbiguousPromotionLanguage(
			input.last_operator_message,
		);
		return {
			candidate,
			ledger_path: ledgerPath,
			entry_id: entryId,
			entry_markdown: entry,
			requires_explicit_confirmation: requiresExplicitConfirmation,
			confirmation_prompt: requiresExplicitConfirmation
				? `Confirm: write ${entryId} to ${ledgerPath}?`
				: undefined,
		};
	}

	async promoteCandidate(input: {
		candidate_id: string;
		operator_reason?: string;
		last_operator_message?: string;
	}): Promise<StrategyCandidateActionResult> {
		const preview = await this.buildPromotionPreview(input);
		const candidateFile = await this.getCandidateFile(preview.candidate.id);
		const ledgerPath = resolveInside(this.root, preview.ledger_path);
		const auditPath = this.auditPath(preview.candidate.project_id);
		const ledgerBackup = existsSync(ledgerPath)
			? await readFile(ledgerPath, "utf8")
			: undefined;
		const candidateBackup = await readFile(candidateFile.filePath, "utf8");

		try {
			const currentLedger = ledgerBackup || "";
			const nextLedger = appendOrCreateLedger(
				currentLedger,
				preview.entry_markdown,
			);
			await mkdir(path.dirname(ledgerPath), { recursive: true });
			const stagingLedgerPath = path.join(
				path.dirname(ledgerPath),
				`.${path.basename(ledgerPath)}.${randomUUID()}.tmp`,
			);
			await writeFile(stagingLedgerPath, nextLedger, "utf8");
			await rename(stagingLedgerPath, ledgerPath);

			const updated = await this.updateCandidate(candidateFile, preview.candidate.id, {
				status: "promoted",
				promoted_at: nowIso(),
				updated_at: nowIso(),
				ledger_entry_id: preview.entry_id,
				ledger_path: preview.ledger_path,
			});
			await this.writeAudit(auditPath, {
				action: "promoted",
				candidate_id: preview.candidate.id,
				project_id: preview.candidate.project_id,
				ledger_path: preview.ledger_path,
				ledger_entry_id: preview.entry_id,
				operator_reason: input.operator_reason || input.last_operator_message || "",
			});
			return {
				candidate: updated,
				audit_path: normalizeSlashes(path.relative(this.root, auditPath)),
				ledger_path: preview.ledger_path,
				ledger_entry_id: preview.entry_id,
			};
		} catch (error) {
			await writeFile(candidateFile.filePath, candidateBackup, "utf8").catch(() => {});
			if (ledgerBackup !== undefined) {
				await writeFile(ledgerPath, ledgerBackup, "utf8").catch(() => {});
			} else if (existsSync(ledgerPath)) {
				await rm(ledgerPath, { force: true }).catch(() => {});
			}
			throw error;
		}
	}

	async declineCandidate(input: {
		candidate_id: string;
		rationale?: string;
	}): Promise<StrategyCandidateActionResult> {
		const candidateFile = await this.getCandidateFile(input.candidate_id);
		const updated = await this.updateCandidate(candidateFile, input.candidate_id, {
			status: "declined",
			declined_at: nowIso(),
			updated_at: nowIso(),
			decline_reason: input.rationale || "",
		});
		const auditPath = this.auditPath(updated.project_id);
		await this.writeAudit(auditPath, {
			action: "declined",
			candidate_id: updated.id,
			project_id: updated.project_id,
			rationale: input.rationale || "",
		});
		return {
			candidate: updated,
			audit_path: normalizeSlashes(path.relative(this.root, auditPath)),
		};
	}

	private async findCandidateFiles() {
		const projectsRoot = path.join(this.root, "projects");
		const matches: CandidateFileMatch[] = [];

		const walk = async (folderPath: string) => {
			if (!existsSync(folderPath)) return;
			const entries = await readdir(folderPath, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
				const entryPath = path.join(folderPath, entry.name);
				if (entry.isDirectory()) {
					await walk(entryPath);
					continue;
				}
				if (!entry.isFile() || entry.name !== STRATEGY_CANDIDATES_FILE) {
					continue;
				}

				const relative = normalizeSlashes(path.relative(this.root, entryPath));
				const match = relative.match(/^projects\/(.+)\/intake\/(.+)\/strategy-candidates\.json$/);
				if (!match) continue;
				const projectId = match[1];
				matches.push({
					filePath: entryPath,
					relativePath: relative,
					projectId,
					intakeFolderPath: path.dirname(entryPath),
					intakeFolderRelativePath: normalizeSlashes(match[2]),
				});
			}
		};

		await walk(projectsRoot);
		return matches;
	}

	private normalizeCandidate(
		match: CandidateFileMatch,
		raw: StrategyCandidateFileEntry,
		metadata?: IntakeMetadata,
		stats?: { mtime?: Date },
	): StrategyLedgerCandidate {
		const sourceIntake = raw.source_intake || match.intakeFolderRelativePath;
		const finding = raw.finding || "Untitled strategy candidate";
		return {
			id: raw.id || `strategy-${stableId(`${match.relativePath}-${finding}`)}`,
			project_id: metadata?.project_id || match.projectId,
			lane: raw.lane || "Strategy Ledger candidates",
			finding,
			evidence: evidenceArray(raw.evidence, sourceIntake),
			confidence: raw.confidence || "medium",
			priority: raw.priority || "medium",
			status: statusFromText(raw.status),
			source_intake: sourceIntake,
			source_intake_title: metadata?.title || path.basename(match.intakeFolderPath),
			source_intake_type: metadata?.type || path.basename(path.dirname(match.intakeFolderPath)),
			source_ingested_at: metadata?.ingested_at,
			candidate_path: match.filePath,
			candidate_relative_path: match.relativePath,
			intake_folder_relative_path: normalizeSlashes(
				path.relative(this.root, match.intakeFolderPath),
			),
			updated_at: raw.updated_at || stats?.mtime?.toISOString(),
			promoted_at: raw.promoted_at,
			declined_at: raw.declined_at,
			decline_reason: raw.decline_reason,
			ledger_entry_id: raw.ledger_entry_id,
			ledger_path: raw.ledger_path,
		};
	}

	private async getCandidate(candidateId: string) {
		const candidates = await this.listLedgerCandidates({ include_resolved: true });
		const candidate = candidates.find((entry) => entry.id === candidateId);
		if (!candidate) {
			throw new Error(`Strategy candidate not found: ${candidateId}`);
		}
		return candidate;
	}

	private async getCandidateFile(candidateId: string) {
		const matches = await this.findCandidateFiles();
		for (const match of matches) {
			const entries =
				(await readJson<StrategyCandidateFileEntry[]>(match.filePath)) || [];
			if (entries.some((entry) => entry.id === candidateId)) {
				return { ...match, entries };
			}
		}
		throw new Error(`Strategy candidate file not found: ${candidateId}`);
	}

	private async updateCandidate(
		candidateFile: CandidateFileMatch & { entries: StrategyCandidateFileEntry[] },
		candidateId: string,
		updates: Partial<StrategyCandidateFileEntry>,
	) {
		const nextEntries = candidateFile.entries.map((entry) =>
			entry.id === candidateId ? { ...entry, ...updates } : entry,
		);
		await writeJson(candidateFile.filePath, nextEntries);
		const candidates = await this.listLedgerCandidates({ include_resolved: true });
		const updated = candidates.find((candidate) => candidate.id === candidateId);
		if (!updated) {
			throw new Error(`Updated strategy candidate not found: ${candidateId}`);
		}
		return updated;
	}

	private ledgerPathForCandidate(candidate: StrategyLedgerCandidate) {
		return normalizeSlashes(
			path.join("projects", ...projectSegments(candidate.project_id), "strategy-ledger.md"),
		);
	}

	private auditPath(projectId: string) {
		const day = nowIso().slice(0, 10);
		return path.join(
			this.root,
			"runs",
			"dialogues",
			...projectSegments(projectId),
			"strategy-pulse",
			day,
			"audit.jsonl",
		);
	}

	private async writeAudit(filePath: string, event: Record<string, unknown>) {
		await mkdir(path.dirname(filePath), { recursive: true });
		await appendFile(filePath, `${JSON.stringify({ ...event, at: nowIso() })}\n`, "utf8");
	}

	private confidenceScore(confidence: string) {
		const normalized = confidence.toLowerCase();
		if (normalized.includes("verified")) return 4;
		if (normalized.includes("high")) return 3;
		if (normalized.includes("medium")) return 2;
		if (normalized.includes("low")) return 1;
		return 0;
	}

	private nextReviewDate() {
		const date = new Date();
		date.setDate(date.getDate() + 30);
		return date.toISOString().slice(0, 10);
	}
}

let singleton: FactoryStrategyPulseStore | undefined;

export const getFactoryStrategyPulseStore = () => {
	if (!singleton) {
		singleton = new FactoryStrategyPulseStore();
	}
	return singleton;
};
