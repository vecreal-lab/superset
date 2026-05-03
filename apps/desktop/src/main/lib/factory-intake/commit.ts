import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
	appendFile,
	mkdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import path from "node:path";

import type { IntakeBundle, IntakePropagationTarget } from ".";

export type PropagationAction = "create" | "append" | "update";
export type PropagationTargetType =
	| "domain-knowledge"
	| "draft"
	| "strategy"
	| "lesson"
	| "other";

export interface PropagationTargetPreview {
	path: string;
	type: PropagationTargetType;
	action: PropagationAction;
	before_content: string;
	after_content: string;
	summary: string;
	virtual: boolean;
}

export interface PropagationCandidatePreview {
	id: string;
	kind: "strategy" | "lesson";
	title: string;
	body: string;
	status: string;
	source_intake: string;
}

export interface PropagationPreview {
	intake_id: string;
	project_id: string;
	title: string;
	target_count: number;
	requires_explicit_confirmation: boolean;
	confirmation_prompt?: string;
	targets: PropagationTargetPreview[];
	strategy_candidates: PropagationCandidatePreview[];
	lesson_candidates: PropagationCandidatePreview[];
}

export interface PropagationCommitInput {
	operator_reason?: string;
	skipped_paths?: string[];
	edited_targets?: { path: string; content: string }[];
	simulate_failure_at?: number;
}

export interface PropagationTargetReceipt {
	target: string;
	action: PropagationAction;
	status: "created" | "updated" | "skipped" | "failed";
	writtenAt: string;
	error?: string;
}

export interface PropagationCommitResult {
	receiptPath: string;
	appliedTargets: string[];
	stagingDir?: string;
	targetReceipts: PropagationTargetReceipt[];
}

interface FileOperation {
	target: string;
	finalPath: string;
	action: PropagationAction;
	content: string;
}

interface BackupEntry {
	path: string;
	existed: boolean;
	content?: string;
}

const normalizeSlashes = (value: string) => value.replace(/\\/g, "/");
const nowIso = () => new Date().toISOString();

const stableIdPart = (value: string) =>
	createHash("sha1").update(value).digest("hex").slice(0, 10);

const slugify = (value: string) => {
	const slug = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
	return slug || `candidate-${Date.now()}`;
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
	const normalized = normalizeSlashes(relativePath).replace(/^\/+/, "");
	const candidate = path.resolve(base, normalized);
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

const writeJson = async (filePath: string, value: unknown) => {
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const findFactoryRoot = () => {
	const envRoot = process.env.SOFTWARE_FACTORY_ROOT || process.env.FACTORY_ROOT;
	if (envRoot) return path.resolve(envRoot);

	let current = process.cwd();
	for (let index = 0; index < 12; index += 1) {
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

const forbiddenPropagationPatterns = [
	/^projects\/_shared\/foundations\//,
	/^projects\/[^/]+\/foundations\//,
	/^projects\/[^/]+\/[^/]+\/foundations\//,
	/^work-orders\//,
	/^docs\/brand\//,
];

const isForbiddenPropagationPath = (relativePath: string) =>
	forbiddenPropagationPatterns.some((pattern) =>
		pattern.test(normalizeSlashes(relativePath).replace(/^\/+/, "")),
	);

function outputContent(bundle: IntakeBundle, key: string) {
	return bundle.outputs.find((output) => output.key === key)?.content || "";
}

function candidateLines(content: string) {
	return content
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("#"))
		.map((line) => line.replace(/^[-*]\s*/, ""))
		.filter((line) => line && !line.startsWith("Source intake:") && !line.startsWith("Project:"));
}

function classifyTarget(targetPath: string): PropagationTargetType {
	const normalized = normalizeSlashes(targetPath);
	if (normalized.includes("/domain-knowledge/")) return "domain-knowledge";
	if (normalized.includes("/drafts/")) return "draft";
	if (normalized.toLowerCase().includes("strategy")) return "strategy";
	if (normalized.toLowerCase().includes("lesson")) return "lesson";
	return "other";
}

function buildTargetContent(bundle: IntakeBundle, target: IntakePropagationTarget) {
	const targetPath = normalizeSlashes(target.path).replace(/^\/+/, "");
	if (target.content?.trim()) return target.content;
	const domainContent = outputContent(bundle, "06-strategy-signals");
	const productContent = outputContent(bundle, "04-product-implications");
	const summary = bundle.summary || bundle.raw_input;
	const type = classifyTarget(targetPath);
	const body =
		type === "domain-knowledge"
			? domainContent || summary
			: type === "draft"
				? productContent || summary
				: summary;

	return `# Intake Propagation

Source intake: \`${bundle.item.folder_relative_path}\`
Target: \`${targetPath}\`
Prepared: ${nowIso()}

${body.trim() || "TKTK - intake propagation content needs review."}
`;
}

function isAmbiguousLastOperatorTurn(bundle: IntakeBundle) {
	const lastOperator = [...bundle.dialogue]
		.reverse()
		.find((message) => message.speaker === "operator");
	if (!lastOperator) return false;
	return /^(looks?\s+good|do it|sounds?\s+good|ok(?:ay)?|yes|approved?|ship it)\b/i.test(
		lastOperator.content.trim(),
	);
}

function strategyCandidates(bundle: IntakeBundle): PropagationCandidatePreview[] {
	return candidateLines(outputContent(bundle, "07-lessons-candidates")).map((line, index) => ({
		id: `strategy-${stableIdPart(`${bundle.item.id}-${line}`)}`,
		kind: "strategy",
		title: `Strategy candidate ${index + 1}`,
		body: line,
		status: "Pending review on Strategy Pulse",
		source_intake: bundle.item.folder_relative_path,
	}));
}

function lessonCandidates(bundle: IntakeBundle): PropagationCandidatePreview[] {
	return candidateLines(outputContent(bundle, "08-propagation-targets")).map((line, index) => ({
		id: `lesson-${stableIdPart(`${bundle.item.id}-${line}`)}`,
		kind: "lesson",
		title: `Lesson candidate ${index + 1}`,
		body: line,
		status: "Pending review as Tier 2 lesson candidate",
		source_intake: bundle.item.folder_relative_path,
	}));
}

export async function buildPropagationPreview(
	bundle: IntakeBundle,
): Promise<PropagationPreview> {
	const root = findFactoryRoot();
	const targets: PropagationTargetPreview[] = [];

	for (const target of bundle.propagation_targets) {
		const normalized = normalizeSlashes(target.path).replace(/^\/+/, "");
		if (isForbiddenPropagationPath(normalized)) {
			throw new Error(`Forbidden Chunk 2 propagation target: ${normalized}`);
		}
		const type = classifyTarget(normalized);
		const virtual = type === "strategy" || type === "lesson";
		const after = virtual ? "" : buildTargetContent(bundle, target);
		const finalPath = virtual ? undefined : resolveInside(root, normalized);
		const before = finalPath ? await readText(finalPath) : "";
		const action: PropagationAction = !finalPath || !existsSync(finalPath)
			? "create"
			: normalized.endsWith(".md")
				? "append"
				: "update";
		const afterContent =
			action === "append" && before.trim()
				? `${before.trimEnd()}\n\n---\n\n${after.trimStart()}`
				: after;
		targets.push({
			path: normalized,
			type,
			action,
			before_content: before,
			after_content: afterContent,
			summary: target.reason || afterContent.slice(0, 220),
			virtual,
		});
	}

	return {
		intake_id: bundle.item.id,
		project_id: bundle.item.project_id,
		title: bundle.item.title,
		target_count: targets.filter((target) => !target.virtual).length,
		requires_explicit_confirmation: isAmbiguousLastOperatorTurn(bundle),
		confirmation_prompt: isAmbiguousLastOperatorTurn(bundle)
			? `Confirm propagation of ${targets.length} plan items for ${bundle.item.title}.`
			: undefined,
		targets,
		strategy_candidates: strategyCandidates(bundle),
		lesson_candidates: lessonCandidates(bundle),
	};
}

function operationForPreview(
	root: string,
	target: PropagationTargetPreview,
	editedContent?: string,
): FileOperation | undefined {
	if (target.virtual) return undefined;
	const finalPath = resolveInside(root, target.path);
	return {
		target: target.path,
		finalPath,
		action: target.action,
		content: editedContent ?? target.after_content,
	};
}

function parseDomainAreaTarget(targetPath: string) {
	const match = normalizeSlashes(targetPath).match(
		/^projects\/(.+)\/domain-knowledge\/([^/]+)\/intake-snippets\/[^/]+\.md$/,
	);
	if (!match) return undefined;
	return {
		projectId: match[1],
		area: match[2],
	};
}

async function domainAreaOperations(
	root: string,
	bundle: IntakeBundle,
	targets: PropagationTargetPreview[],
): Promise<FileOperation[]> {
	const operations: FileOperation[] = [];
	const seenAreas = new Set<string>();
	for (const target of targets) {
		const areaTarget = parseDomainAreaTarget(target.path);
		if (!areaTarget) continue;
		const key = `${areaTarget.projectId}/${areaTarget.area}`;
		if (seenAreas.has(key)) continue;
		seenAreas.add(key);

		const areaRoot = `projects/${areaTarget.projectId}/domain-knowledge/${areaTarget.area}`;
		const overviewPath = `${areaRoot}/overview.md`;
		const overviewFinalPath = resolveInside(root, overviewPath);
		if (!existsSync(overviewFinalPath)) {
			operations.push({
				target: overviewPath,
				finalPath: overviewFinalPath,
				action: "create",
				content: `# ${areaTarget.area}

Status: seeded from intake
Source intake: \`${bundle.item.folder_relative_path}\`

This domain area was created automatically during Layer 2 intake propagation.
DOMAIN_KNOWLEDGE_STEWARD curates this area after enough snippets accumulate.
`,
			});
		}

		const indexPath = `projects/${areaTarget.projectId}/domain-knowledge/INDEX.md`;
		const indexFinalPath = resolveInside(root, indexPath);
		const currentIndex = await readText(indexFinalPath);
		if (!currentIndex.includes(`| ${areaTarget.area} |`)) {
			const nextIndex = currentIndex.trim()
				? `${currentIndex.trimEnd()}\n| ${areaTarget.area} | seeded | ${bundle.item.folder_relative_path} |\n`
				: `# Domain Knowledge Index

| Area | Status | Source |
|---|---|---|
| ${areaTarget.area} | seeded | ${bundle.item.folder_relative_path} |
`;
			operations.push({
				target: indexPath,
				finalPath: indexFinalPath,
				action: currentIndex.trim() ? "append" : "create",
				content: nextIndex,
			});
		}
	}
	return operations;
}

function strategyCandidateOperation(
	root: string,
	bundle: IntakeBundle,
	candidates: PropagationCandidatePreview[],
): FileOperation | undefined {
	if (candidates.length === 0) return undefined;
	const target = normalizeSlashes(
		path.join(bundle.item.folder_relative_path, "strategy-candidates.json"),
	);
	return {
		target,
		finalPath: resolveInside(root, target),
		action: "create",
		content: `${JSON.stringify(
			candidates.map((candidate) => ({
				id: candidate.id,
				lane: "Strategy Ledger candidates",
				finding: candidate.body,
				evidence: [bundle.item.folder_relative_path],
				confidence: "medium",
				priority: "medium",
				source_intake: bundle.item.folder_relative_path,
				status: "pending_review",
			})),
			null,
			2,
		)}\n`,
	};
}

function lessonCandidateOperations(
	root: string,
	bundle: IntakeBundle,
	candidates: PropagationCandidatePreview[],
) {
	return candidates.map((candidate) => {
		const target = `projects/_shared/lessons/_intake-candidates/${slugify(
			bundle.item.slug,
		)}-${slugify(candidate.body)}.md`;
		return {
			target,
			finalPath: resolveInside(root, target),
			action: "create" as const,
			content: `# ${candidate.title}

Status: pending intake promotion
Default target tier: Tier 2
Source intake: \`${bundle.item.folder_relative_path}\`
Candidate id: \`${candidate.id}\`

## Lesson Candidate

${candidate.body}

## Provenance

- Intake: \`${bundle.item.id}\`
- Project: \`${bundle.item.project_id}\`
`,
		};
	});
}

async function writeAtomicOperations(
	stagingDir: string,
	operations: FileOperation[],
	simulateFailureAt?: number,
) {
	const targetReceipts: PropagationTargetReceipt[] = [];
	const backups: BackupEntry[] = [];
	const moved: BackupEntry[] = [];

	await mkdir(stagingDir, { recursive: true });
	try {
		for (const [index, operation] of operations.entries()) {
			if (simulateFailureAt && index + 1 === simulateFailureAt) {
				throw new Error(`Simulated propagation failure at target ${simulateFailureAt}`);
			}
			const stagedPath = path.join(stagingDir, operation.target);
			await mkdir(path.dirname(stagedPath), { recursive: true });
			await writeFile(stagedPath, operation.content, "utf8");
			backups.push({
				path: operation.finalPath,
				existed: existsSync(operation.finalPath),
				content: existsSync(operation.finalPath)
					? await readFile(operation.finalPath, "utf8")
					: undefined,
			});
		}

		for (const operation of operations) {
			const stagedPath = path.join(stagingDir, operation.target);
			await mkdir(path.dirname(operation.finalPath), { recursive: true });
			const backup = backups.find((entry) => entry.path === operation.finalPath);
			if (existsSync(operation.finalPath)) {
				await rm(operation.finalPath, { force: true });
			}
			await rename(stagedPath, operation.finalPath);
			if (backup) moved.push(backup);
			targetReceipts.push({
				target: operation.target,
				action: operation.action,
				status: operation.action === "create" ? "created" : "updated",
				writtenAt: nowIso(),
			});
		}

		return targetReceipts;
	} catch (error) {
		for (const backup of moved.reverse()) {
			if (backup.existed && backup.content !== undefined) {
				await mkdir(path.dirname(backup.path), { recursive: true });
				await writeFile(backup.path, backup.content, "utf8");
			} else if (!backup.existed && existsSync(backup.path)) {
				await rm(backup.path, { force: true });
			}
		}
		throw error;
	}
}

async function updateInventoryStatus(bundle: IntakeBundle) {
	const root = findFactoryRoot();
	const inventoryPath =
		bundle.item.inventory_path ||
		path.join(root, "projects", ...projectSegments(bundle.item.project_id), "intake", "INVENTORY.md");
	const content = await readText(inventoryPath);
	if (!content.trim()) return;
	const folderToken = normalizeSlashes(
		path.relative(
			path.join(root, "projects", ...projectSegments(bundle.item.project_id), "intake"),
			bundle.item.folder_path,
		),
	);
	const lines = content.split(/\r?\n/).map((line) => {
		if (!line.includes(folderToken) || !line.trim().startsWith("|")) return line;
		const cells = line
			.trim()
			.replace(/^\||\|$/g, "")
			.split("|")
			.map((cell) => cell.trim());
		const statusIndex = cells.findIndex((cell) =>
			["pending", "digesting", "digested", "propagated", "shelved", "declined"].includes(
				cell.toLowerCase(),
			),
		);
		if (statusIndex >= 0) cells[statusIndex] = "propagated";
		return `| ${cells.join(" | ")} |`;
	});
	await writeFile(inventoryPath, `${lines.join("\n")}\n`, "utf8");
}

async function updateMetadataStatus(bundle: IntakeBundle) {
	const metadataPath = path.join(bundle.item.folder_path, "intake.json");
	const raw = await readText(metadataPath);
	if (!raw.trim()) return;
	const metadata = JSON.parse(raw) as Record<string, unknown>;
	metadata.status = "propagated";
	metadata.updated_at = nowIso();
	metadata.propagated_at = nowIso();
	await writeJson(metadataPath, metadata);
}

async function writeAuditEntries(
	root: string,
	bundle: IntakeBundle,
	receipts: PropagationTargetReceipt[],
) {
	const auditDir = path.join(
		root,
		"runs",
		"dialogues",
		...projectSegments(bundle.item.project_id),
		"intake",
		slugify(bundle.item.slug),
	);
	await mkdir(auditDir, { recursive: true });
	for (const receipt of receipts) {
		await appendFile(
			path.join(auditDir, "audit.jsonl"),
			`${JSON.stringify({
				id: randomUUID(),
				intake_id: bundle.item.id,
				project_id: bundle.item.project_id,
				target_path: receipt.target,
				status: receipt.status,
				action: receipt.action,
				written_at: receipt.writtenAt,
			})}\n`,
			"utf8",
		);
	}
}

export async function commitPropagation(
	bundle: IntakeBundle,
	input: PropagationCommitInput,
): Promise<PropagationCommitResult> {
	const root = findFactoryRoot();
	const preview = await buildPropagationPreview(bundle);
	const skipped = new Set((input.skipped_paths || []).map(normalizeSlashes));
	const edits = new Map(
		(input.edited_targets || []).map((edit) => [normalizeSlashes(edit.path), edit.content]),
	);

	const targetOperations = preview.targets
		.filter((target) => !skipped.has(target.path))
		.map((target) => operationForPreview(root, target, edits.get(target.path)))
		.filter((operation): operation is FileOperation => Boolean(operation));
	const areaOperations = await domainAreaOperations(root, bundle, preview.targets);
	const strategyOperation = strategyCandidateOperation(
		root,
		bundle,
		preview.strategy_candidates,
	);
	const lessonOperations = lessonCandidateOperations(
		root,
		bundle,
		preview.lesson_candidates,
	);
	const operations = [
		...targetOperations,
		...areaOperations,
		...(strategyOperation ? [strategyOperation] : []),
		...lessonOperations,
	];

	if (operations.length === 0) {
		throw new Error("No non-skipped propagation targets are available to write.");
	}

	const stagingDir = path.join(bundle.item.folder_path, `.propagation-staging-${Date.now()}`);
	const skippedReceipts: PropagationTargetReceipt[] = [...skipped].map((target) => ({
		target,
		action: "update",
		status: "skipped",
		writtenAt: nowIso(),
	}));

	let targetReceipts: PropagationTargetReceipt[] = [];
	try {
		targetReceipts = await writeAtomicOperations(
			stagingDir,
			operations,
			input.simulate_failure_at,
		);
	} catch (error) {
		const failedReceipts = operations.map((operation) => ({
			target: operation.target,
			action: operation.action,
			status: "failed" as const,
			writtenAt: nowIso(),
			error: error instanceof Error ? error.message : String(error),
		}));
		const receiptPath = path.join(bundle.item.folder_path, "propagation-receipt.json");
		await writeJson(receiptPath, {
			intake_id: bundle.item.id,
			project_id: bundle.item.project_id,
			status: "failed",
			staging_dir: normalizeSlashes(path.relative(root, stagingDir)),
			targets: [...skippedReceipts, ...failedReceipts],
		});
		throw new Error(
			`Atomic propagation failed; staging preserved at ${normalizeSlashes(
				path.relative(root, stagingDir),
			)}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	await rm(stagingDir, { recursive: true, force: true });
	await updateMetadataStatus(bundle);
	await updateInventoryStatus(bundle);
	await writeAuditEntries(root, bundle, targetReceipts);

	const allReceipts = [...skippedReceipts, ...targetReceipts];
	const receiptPath = path.join(bundle.item.folder_path, "propagation-receipt.json");
	await writeJson(receiptPath, {
		intake_id: bundle.item.id,
		project_id: bundle.item.project_id,
		status: "propagated",
		applied_at: nowIso(),
		operator_reason: input.operator_reason || "",
		targets: allReceipts,
	});

	return {
		receiptPath,
		appliedTargets: targetReceipts.map((receipt) => receipt.target),
		targetReceipts: allReceipts,
	};
}
