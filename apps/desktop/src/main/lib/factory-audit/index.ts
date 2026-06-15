import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { findFactoryRoot } from "main/lib/coordinator/prompt-loader";

const RUNS_ROOT = "runs";

export type AuditSeverity = "info" | "warning" | "blocker";

export interface AuditSummary {
	id: string;
	path: string;
	woId: string;
	title: string;
	severity: AuditSeverity;
	modifiedAt: string;
	excerpt: string;
}

export interface AuditReadResult extends AuditSummary {
	content: string;
}

export interface RecurringAuditPattern {
	id: string;
	text: string;
	count: number;
	paths: string[];
	severity: AuditSeverity;
}

const normalizeSlashes = (value: string) => value.replace(/\\/g, "/");

const normalizeRelativePath = (input: string) =>
	normalizeSlashes(input).replace(/^\.\//, "").replace(/^\/+/, "");

const isInsidePath = (base: string, candidate: string) => {
	const relative = path.relative(base, candidate);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

function resolveRunPath(root: string, relativePath: string) {
	const normalized = normalizeRelativePath(relativePath);
	const resolved = path.resolve(root, normalized);
	const runsRoot = path.resolve(root, RUNS_ROOT);
	if (!isInsidePath(runsRoot, resolved)) {
		throw new Error("Audit path is outside the runs receipt surface.");
	}
	return { normalized, resolved };
}

async function walkMarkdownFiles(root: string, relativeDir: string, depth = 0): Promise<string[]> {
	if (depth > 8) return [];
	const { resolved } = resolveRunPath(root, relativeDir);
	const entries = await readdir(resolved, { withFileTypes: true }).catch(() => []);
	const files: string[] = [];
	for (const entry of entries) {
		const child = `${relativeDir}/${entry.name}`;
		if (entry.isDirectory()) {
			if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "worktree") {
				continue;
			}
			files.push(...(await walkMarkdownFiles(root, child, depth + 1)));
			continue;
		}
		if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
			files.push(normalizeRelativePath(child));
		}
	}
	return files;
}

function titleFromMarkdown(raw: string, fallback: string) {
	return raw.match(/^#\s+(.+)$/m)?.[1]?.trim() || fallback;
}

function excerpt(raw: string) {
	return raw
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.slice(0, 6)
		.join("\n")
		.slice(0, 800);
}

function severityFromText(raw: string): AuditSeverity {
	const lower = raw.toLowerCase();
	if (/\b(blocker|critical|failed|failure|p0)\b/.test(lower)) return "blocker";
	if (/\b(warning|warn|risk|partial|p1|p2)\b/.test(lower)) return "warning";
	return "info";
}

function woIdFromPath(relativePath: string) {
	return relativePath.split("/")[1] || "runs";
}

function canonicalPatternLine(line: string) {
	return line
		.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "")
		.replace(/\[[ xX]\]/g, "")
		.replace(/`[^`]+`/g, "`...`")
		.replace(/\b\d+(?:\.\d+)?\b/g, "N")
		.replace(/\s+/g, " ")
		.trim();
}

export class FactoryAuditRuntime {
	private readonly root: string;

	constructor(root = findFactoryRoot()) {
		this.root = root;
	}

	async listAudits(): Promise<AuditSummary[]> {
		const runsRoot = path.resolve(this.root, RUNS_ROOT);
		if (!existsSync(runsRoot)) return [];
		const files = (await walkMarkdownFiles(this.root, RUNS_ROOT)).filter((file) =>
			/audit/i.test(path.basename(file)),
		);
		const summaries = await Promise.all(
			files.map(async (relativePath) => {
				const { resolved } = resolveRunPath(this.root, relativePath);
				const [raw, fileStat] = await Promise.all([readFile(resolved, "utf8"), stat(resolved)]);
				return {
					id: relativePath,
					path: relativePath,
					woId: woIdFromPath(relativePath),
					title: titleFromMarkdown(raw, path.basename(relativePath, ".md")),
					severity: severityFromText(raw),
					modifiedAt: fileStat.mtime.toISOString(),
					excerpt: excerpt(raw),
				};
			}),
		);
		return summaries.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
	}

	async getAudit(input: { path: string }): Promise<AuditReadResult> {
		const { normalized, resolved } = resolveRunPath(this.root, input.path);
		const [raw, fileStat] = await Promise.all([readFile(resolved, "utf8"), stat(resolved)]);
		return {
			id: normalized,
			path: normalized,
			woId: woIdFromPath(normalized),
			title: titleFromMarkdown(raw, path.basename(normalized, ".md")),
			severity: severityFromText(raw),
			modifiedAt: fileStat.mtime.toISOString(),
			excerpt: excerpt(raw),
			content: raw,
		};
	}

	async detectRecurringPatterns(): Promise<RecurringAuditPattern[]> {
		const audits = await this.listAudits();
		const buckets = new Map<string, { paths: Set<string>; severity: AuditSeverity }>();
		for (const audit of audits) {
			const detail = await this.getAudit({ path: audit.path });
			for (const line of detail.content.split(/\r?\n/)) {
				const pattern = canonicalPatternLine(line);
				if (pattern.length < 28 || pattern.startsWith("#")) continue;
				if (!/\b(fail|failed|blocker|warning|risk|missing|overflow|boundary|token|path a)\b/i.test(pattern)) {
					continue;
				}
				if (!buckets.has(pattern)) buckets.set(pattern, { paths: new Set(), severity: audit.severity });
				const bucket = buckets.get(pattern);
				bucket?.paths.add(audit.path);
				if (audit.severity === "blocker") bucket!.severity = "blocker";
				else if (audit.severity === "warning" && bucket?.severity === "info") {
					bucket.severity = "warning";
				}
			}
		}
		return [...buckets.entries()]
			.map(([text, value], index) => ({
				id: `audit-pattern-${index + 1}`,
				text,
				count: value.paths.size,
				paths: [...value.paths].sort(),
				severity: value.severity,
			}))
			.filter((pattern) => pattern.count > 1)
			.sort((left, right) => right.count - left.count || left.text.localeCompare(right.text))
			.slice(0, 25);
	}
}

let singleton: FactoryAuditRuntime | undefined;

export const getFactoryAuditRuntime = () => {
	if (!singleton) singleton = new FactoryAuditRuntime();
	return singleton;
};
