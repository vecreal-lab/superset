import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
	appendFile,
	mkdir,
	readFile,
	readdir,
	rm,
	rename,
	writeFile,
} from "node:fs/promises";
import path from "node:path";

import { invokeFactoryCliRole } from "main/lib/factory-cli";

export type LessonCandidateStatus =
	| "pending_review"
	| "promoted"
	| "declined"
	| "reverted";

export type LessonTier = 1 | 2 | 3;

export interface IntakeLessonCandidate {
	id: string;
	title: string;
	body: string;
	source_intake: string;
	source_intake_summary: string;
	recommended_tier: LessonTier;
	recommended_target_role?: string;
	recommended_target_project?: string;
	status: LessonCandidateStatus;
	created_at?: string;
	updated_at?: string;
	promoted_at?: string;
	declined_at?: string;
	decline_rationale?: string;
	audit_rationale?: string;
	target_path?: string;
	source_path: string;
	source_relative_path: string;
	frontmatter: Record<string, string>;
}

export interface LessonPromotionPreview {
	candidate: IntakeLessonCandidate;
	target_tier: LessonTier;
	target_path: string;
	content: string;
	requires_explicit_confirmation: boolean;
	confirmation_prompt?: string;
	audit_required: boolean;
}

export interface LessonPromotionResult {
	candidate: IntakeLessonCandidate;
	target_path?: string;
	audit_path: string;
	audit_confirmed?: boolean;
	audit_response?: string;
}

interface FactoryLessonsStoreOptions {
	root?: string;
	auditInvoker?: (prompt: string) => Promise<string>;
}

interface PromoteInput {
	candidate_id: string;
	target_tier: LessonTier;
	target_role?: string;
	target_project?: string;
	edited_body?: string;
	operator_reason?: string;
	last_operator_message?: string;
}

const CANDIDATE_ROOT = "projects/_shared/lessons/_intake-candidates";

const nowIso = () => new Date().toISOString();

const normalizeSlashes = (value: string) => value.replace(/\\/g, "/");

const stableId = (value: string) =>
	createHash("sha1").update(value).digest("hex").slice(0, 12);

const slugify = (value: string) =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 90) || `lesson-${Date.now()}`;

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
	if (envRoot) return path.resolve(envRoot);
	throw new Error("Unable to locate Software Factory root");
};

const readText = async (filePath: string) => {
	try {
		return await readFile(filePath, "utf8");
	} catch {
		return "";
	}
};

const frontmatterValue = (value: unknown) =>
	String(value ?? "")
		.replace(/\r?\n/g, " ")
		.trim();

const renderFrontmatter = (metadata: Record<string, string>) =>
	`---\n${Object.entries(metadata)
		.filter(([, value]) => value !== undefined)
		.map(([key, value]) => `${key}: ${frontmatterValue(value)}`)
		.join("\n")}\n---\n\n`;

const parseFrontmatter = (content: string) => {
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

const firstHeading = (body: string, fallback: string) =>
	body.match(/^#\s+(.+)$/m)?.[1]?.trim() || fallback;

const parseStatus = (value?: string): LessonCandidateStatus => {
	const normalized = (value || "pending_review").toLowerCase();
	if (normalized === "promoted" || normalized === "declined" || normalized === "reverted") {
		return normalized;
	}
	return "pending_review";
};

const parseTier = (value?: string): LessonTier => {
	const normalized = String(value || "").toLowerCase();
	if (/\b1\b|tier\s*1/.test(normalized)) return 1;
	if (/\b3\b|tier\s*3/.test(normalized)) return 3;
	return 2;
};

const sourceProjectFromIntake = (sourceIntake: string) => {
	const normalized = normalizeSlashes(sourceIntake);
	const match = normalized.match(/^projects\/(.+)\/intake\//);
	return match?.[1] || "software-factory";
};

const isAmbiguousPromotionLanguage = (value?: string) => {
	if (!value?.trim()) return false;
	const normalized = value.trim().toLowerCase();
	return /^(ok|okay|sure|yes|sounds good|looks good|do it|go ahead|approved)\.?$/.test(
		normalized,
	);
};

export class FactoryLessonsStore {
	private readonly root: string;
	private readonly auditInvoker: (prompt: string) => Promise<string>;

	constructor(options: FactoryLessonsStoreOptions = {}) {
		this.root = path.resolve(options.root || findFactoryRoot());
		this.auditInvoker =
			options.auditInvoker ||
			(async (prompt) => {
				const result = await invokeFactoryCliRole({
					provider: "claude",
					roleId: "AUDIT",
					dialogueId: randomUUID(),
					prompt,
				});
				return result.text;
			});
	}

	async listIntakeCandidates(input: {
		status?: LessonCandidateStatus | "all";
	} = {}): Promise<IntakeLessonCandidate[]> {
		const files = await this.findCandidateFiles();
		const candidates: IntakeLessonCandidate[] = [];
		for (const filePath of files) {
			const candidate = await this.readCandidateFile(filePath);
			if (input.status && input.status !== "all" && candidate.status !== input.status) {
				continue;
			}
			candidates.push(candidate);
		}
		return candidates.sort((a, b) =>
			String(b.created_at || b.updated_at || "").localeCompare(
				String(a.created_at || a.updated_at || ""),
			),
		);
	}

	async getCandidate(candidateId: string): Promise<IntakeLessonCandidate> {
		const candidates = await this.listIntakeCandidates({ status: "all" });
		const candidate = candidates.find((entry) => entry.id === candidateId);
		if (!candidate) throw new Error(`Lesson candidate not found: ${candidateId}`);
		return candidate;
	}

	async buildPromotionPreview(input: PromoteInput): Promise<LessonPromotionPreview> {
		const candidate = await this.getCandidate(input.candidate_id);
		const targetTier = input.target_tier || candidate.recommended_tier || 2;
		const body = input.edited_body?.trim() || candidate.body.trim();
		const targetPath = this.targetPath(candidate, {
			target_tier: targetTier,
			target_role: input.target_role || candidate.recommended_target_role,
			target_project:
				input.target_project ||
				candidate.recommended_target_project ||
				sourceProjectFromIntake(candidate.source_intake),
		});
		return {
			candidate,
			target_tier: targetTier,
			target_path: targetPath,
			content:
				targetTier === 1
					? this.renderTierOneAppend(candidate, body)
					: this.renderLessonFile(candidate, body, targetTier),
			requires_explicit_confirmation: isAmbiguousPromotionLanguage(
				input.last_operator_message,
			),
			confirmation_prompt: isAmbiguousPromotionLanguage(input.last_operator_message)
				? `Confirm: promote ${candidate.title} to Tier ${targetTier} at ${targetPath}?`
				: undefined,
			audit_required: targetTier === 3,
		};
	}

	async promoteCandidate(input: PromoteInput): Promise<LessonPromotionResult> {
		const preview = await this.buildPromotionPreview(input);
		const candidatePath = preview.candidate.source_path;
		const targetPath = resolveInside(this.root, preview.target_path);
		const auditPath = this.auditPath(sourceProjectFromIntake(preview.candidate.source_intake));
		const candidateBackup = await readFile(candidatePath, "utf8");
		const targetBackup = existsSync(targetPath)
			? await readFile(targetPath, "utf8")
			: undefined;
		let auditResponse = "";
		let auditConfirmed = preview.target_tier !== 3;

		try {
			if (preview.target_tier === 3) {
				auditResponse = await this.auditInvoker(this.auditPrompt(preview));
				auditConfirmed = /AUDIT_CONFIRM|approved|confirmed/i.test(auditResponse);
				if (!auditConfirmed || /AUDIT_REJECT|reject/i.test(auditResponse)) {
					await this.writeCandidateMetadata(preview.candidate, {
						status: "pending_review",
						updated_at: nowIso(),
						audit_rationale: auditResponse || "AUDIT did not confirm Tier 3 promotion.",
					});
					await this.writeAudit(auditPath, {
						action: "tier3_audit_rejected",
						candidate_id: preview.candidate.id,
						target_path: preview.target_path,
						audit_response: auditResponse,
					});
					return {
						candidate: await this.getCandidate(preview.candidate.id),
						audit_path: normalizeSlashes(path.relative(this.root, auditPath)),
						audit_confirmed: false,
						audit_response: auditResponse,
					};
				}
			}

			await mkdir(path.dirname(targetPath), { recursive: true });
			const nextTarget =
				preview.target_tier === 1 && targetBackup !== undefined
					? `${targetBackup.trimEnd()}\n\n${preview.content.trim()}\n`
					: preview.content;
			const stagingTarget = path.join(
				path.dirname(targetPath),
				`.${path.basename(targetPath)}.${randomUUID()}.tmp`,
			);
			await writeFile(stagingTarget, nextTarget, "utf8");
			await rename(stagingTarget, targetPath);
			await this.writeCandidateMetadata(preview.candidate, {
				status: "promoted",
				promoted_at: nowIso(),
				updated_at: nowIso(),
				target_path: preview.target_path,
				promotion_tier: String(preview.target_tier),
				operator_reason: input.operator_reason || "",
				edit_history: input.edited_body ? `Edited before promotion at ${nowIso()}` : "",
			});
			await this.writeAudit(auditPath, {
				action: "promoted",
				candidate_id: preview.candidate.id,
				target_tier: preview.target_tier,
				target_path: preview.target_path,
				operator_reason: input.operator_reason || "",
				audit_response: auditResponse,
			});
			return {
				candidate: await this.getCandidate(preview.candidate.id),
				target_path: preview.target_path,
				audit_path: normalizeSlashes(path.relative(this.root, auditPath)),
				audit_confirmed: auditConfirmed,
				audit_response: auditResponse,
			};
		} catch (error) {
			await writeFile(candidatePath, candidateBackup, "utf8").catch(() => {});
			if (targetBackup !== undefined) {
				await writeFile(targetPath, targetBackup, "utf8").catch(() => {});
			} else if (existsSync(targetPath)) {
				await rm(targetPath, { force: true }).catch(() => {});
			}
			throw error;
		}
	}

	async declineCandidate(input: {
		candidate_id: string;
		rationale?: string;
	}): Promise<LessonPromotionResult> {
		const candidate = await this.getCandidate(input.candidate_id);
		await this.writeCandidateMetadata(candidate, {
			status: "declined",
			declined_at: nowIso(),
			updated_at: nowIso(),
			decline_rationale: input.rationale || "",
		});
		const auditPath = this.auditPath(sourceProjectFromIntake(candidate.source_intake));
		await this.writeAudit(auditPath, {
			action: "declined",
			candidate_id: candidate.id,
			rationale: input.rationale || "",
		});
		return {
			candidate: await this.getCandidate(candidate.id),
			audit_path: normalizeSlashes(path.relative(this.root, auditPath)),
		};
	}

	private async findCandidateFiles() {
		const root = path.join(this.root, CANDIDATE_ROOT);
		if (!existsSync(root)) return [];
		const entries = await readdir(root, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
			.map((entry) => path.join(root, entry.name));
	}

	private async readCandidateFile(filePath: string): Promise<IntakeLessonCandidate> {
		const raw = await readText(filePath);
		const parsed = parseFrontmatter(raw);
		const body = parsed.body.trim();
		const relative = normalizeSlashes(path.relative(this.root, filePath));
		const title = parsed.data.title || firstHeading(body, path.basename(filePath, ".md"));
		const sourceIntake =
			parsed.data.source_intake ||
			body.match(/Source intake:\s*`?([^`\r\n]+)`?/i)?.[1]?.trim() ||
			"projects/software-factory/intake/unknown";
		const status =
			parsed.data.status ||
			body.match(/^Status:\s*(.+)$/im)?.[1]?.trim().replace(/\s+/g, "_") ||
			"pending_review";
		const projectId =
			parsed.data.recommended_target_project || sourceProjectFromIntake(sourceIntake);
		const sourceSummary = await readText(path.join(this.root, sourceIntake, "SUMMARY.md"));
		return {
			id:
				parsed.data.candidate_id ||
				body.match(/Candidate id:\s*`?([^`\r\n]+)`?/i)?.[1]?.trim() ||
				`lesson-${stableId(relative)}`,
			title,
			body,
			source_intake: normalizeSlashes(sourceIntake),
			source_intake_summary: sourceSummary.trim() || "No source intake summary found.",
			recommended_tier: parseTier(
				parsed.data.recommended_tier ||
					body.match(/^Default target tier:\s*(.+)$/im)?.[1],
			),
			recommended_target_role: parsed.data.recommended_target_role,
			recommended_target_project: projectId,
			status: parseStatus(status),
			created_at: parsed.data.created_at,
			updated_at: parsed.data.updated_at,
			promoted_at: parsed.data.promoted_at,
			declined_at: parsed.data.declined_at,
			decline_rationale: parsed.data.decline_rationale,
			audit_rationale: parsed.data.audit_rationale,
			target_path: parsed.data.target_path,
			source_path: filePath,
			source_relative_path: relative,
			frontmatter: parsed.data,
		};
	}

	private targetPath(
		candidate: IntakeLessonCandidate,
		input: {
			target_tier: LessonTier;
			target_role?: string;
			target_project?: string;
		},
	) {
		const slug = slugify(candidate.title);
		if (input.target_tier === 1) {
			const role = (input.target_role || "INTAKE_STEWARD").replace(/[^A-Z0-9_]/gi, "_");
			return normalizeSlashes(
				path.join("templates", "role-prompts", `${role}-lessons.md`),
			);
		}
		const projectId =
			input.target_tier === 3
				? "_shared"
				: input.target_project ||
					candidate.recommended_target_project ||
					sourceProjectFromIntake(candidate.source_intake);
		return normalizeSlashes(
			input.target_tier === 3
				? path.join("projects", "_shared", "lessons", `${slug}.md`)
				: path.join("projects", ...projectSegments(projectId), "lessons", `${slug}.md`),
		);
	}

	private renderTierOneAppend(candidate: IntakeLessonCandidate, body: string) {
		return `## ${nowIso().slice(0, 10)} — ${candidate.title}

Source intake: \`${candidate.source_intake}\`
Candidate: \`${candidate.id}\`

${body.trim()}
`;
	}

	private renderLessonFile(
		candidate: IntakeLessonCandidate,
		body: string,
		tier: LessonTier,
	) {
		const lessonId = `lesson-${stableId(`${candidate.id}-${tier}`)}`;
		const projectId = sourceProjectFromIntake(candidate.source_intake);
		return `${renderFrontmatter({
			id: lessonId,
			title: candidate.title,
			tier: String(tier),
			origin: "intake",
			origin_run: candidate.source_intake,
			recorded_at: nowIso(),
			last_seen_at: nowIso(),
			occurrence_count: "1",
			situation: "Captured from Layer 2 intake candidate.",
			failure_or_surprise: "See lesson body.",
			correction: "See lesson body.",
			confidence_in_lesson: "medium",
			promotion_history: `Promoted from ${candidate.id} by cockpit.`,
			citation: candidate.source_intake,
			supersedes: "",
			status: "active",
			project_id: tier === 3 ? "factory-shared" : projectId,
		})}# ${candidate.title}

${body.trim()}
`;
	}

	private async writeCandidateMetadata(
		candidate: IntakeLessonCandidate,
		updates: Record<string, string>,
	) {
		const metadata = {
			...candidate.frontmatter,
			candidate_id: candidate.id,
			title: candidate.title,
			source_intake: candidate.source_intake,
			recommended_tier: String(candidate.recommended_tier),
			recommended_target_role: candidate.recommended_target_role || "",
			recommended_target_project: candidate.recommended_target_project || "",
			created_at: candidate.created_at || nowIso(),
			...updates,
		};
		await writeFile(
			candidate.source_path,
			`${renderFrontmatter(metadata)}${candidate.body.trim()}\n`,
			"utf8",
		);
	}

	private auditPath(projectId: string) {
		return path.join(
			this.root,
			"runs",
			"dialogues",
			...projectSegments(projectId),
			"lessons",
			nowIso().slice(0, 10),
			"audit.jsonl",
		);
	}

	private async writeAudit(filePath: string, event: Record<string, unknown>) {
		await mkdir(path.dirname(filePath), { recursive: true });
		await appendFile(filePath, `${JSON.stringify({ ...event, at: nowIso() })}\n`, "utf8");
	}

	private auditPrompt(preview: LessonPromotionPreview) {
		return `You are AUDIT reviewing a proposed Tier 3 factory-shared lesson promotion.

Return one of:
- AUDIT_CONFIRM: <brief rationale>
- AUDIT_REJECT: <brief rationale>

Candidate: ${preview.candidate.title}
Source intake: ${preview.candidate.source_intake}
Target path: ${preview.target_path}

Proposed lesson:

${preview.content}
`;
	}
}

let singleton: FactoryLessonsStore | undefined;

export const getFactoryLessonsStore = () => {
	if (!singleton) singleton = new FactoryLessonsStore();
	return singleton;
};
