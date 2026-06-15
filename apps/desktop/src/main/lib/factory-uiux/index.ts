import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { findFactoryRoot } from "main/lib/coordinator/prompt-loader";

const UIUX_ROOT = "projects/software-factory/uiux";
const SCREENS_ROOT = `${UIUX_ROOT}/screens`;
const RUNS_ROOT = "runs";

interface ExpectedStageCBrief {
	screenId: string;
	title: string;
	route: string;
	slug: string;
	canonicalPath: string;
}

const EXPECTED_STAGE_C_BRIEFS: ExpectedStageCBrief[] = [
	{
		screenId: "factory-home",
		title: "Factory Home",
		route: "/factory/home",
		slug: "factory-home",
		canonicalPath: `${SCREENS_ROOT}/factory-home.md`,
	},
	{
		screenId: "factory-work-orders-list",
		title: "Work Orders List",
		route: "/factory/work-orders",
		slug: "factory-work-orders-list",
		canonicalPath: `${SCREENS_ROOT}/work-orders-list.md`,
	},
	{
		screenId: "factory-work-orders-detail",
		title: "Work Order Detail",
		route: "/factory/work-orders/$workOrderId",
		slug: "factory-work-orders-detail",
		canonicalPath: `${SCREENS_ROOT}/work-orders-detail.md`,
	},
	{
		screenId: "factory-design-system",
		title: "Design System",
		route: "/factory/design-system",
		slug: "factory-design-system",
		canonicalPath: `${SCREENS_ROOT}/design-system.md`,
	},
	{
		screenId: "factory-decks-list",
		title: "Decks List",
		route: "/factory/projects/$projectId/decks",
		slug: "factory-decks-list",
		canonicalPath: `${SCREENS_ROOT}/decks-list.md`,
	},
	{
		screenId: "factory-decks-detail",
		title: "Deck Detail",
		route: "/factory/projects/$projectId/decks/$deckId",
		slug: "factory-decks-detail",
		canonicalPath: `${SCREENS_ROOT}/decks-detail.md`,
	},
	{
		screenId: "factory-approval-queue",
		title: "Approval Queue",
		route: "/factory/approvals",
		slug: "factory-approval-queue",
		canonicalPath: `${SCREENS_ROOT}/approval-queue.md`,
	},
];

export interface UiuxSourceDocument {
	path: string;
	title: string;
	content: string;
	exists: boolean;
	modifiedAt?: string;
}

export interface StageCBriefSummary extends ExpectedStageCBrief {
	canonicalExists: boolean;
	canonicalModifiedAt?: string;
	inferredPath?: string;
	inferredExists: boolean;
	inferredModifiedAt?: string;
	status: "canonical" | "inferred_available" | "missing";
}

export interface UiuxValidationFinding {
	id: string;
	path: string;
	woId: string;
	title: string;
	modifiedAt: string;
	excerpt: string;
}

const normalizeSlashes = (value: string) => value.replace(/\\/g, "/");

const normalizeRelativePath = (input: string) =>
	normalizeSlashes(input).replace(/^\.\//, "").replace(/^\/+/, "");

const isInsidePath = (base: string, candidate: string) => {
	const relative = path.relative(base, candidate);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

function resolveInside(root: string, relativePath: string) {
	const normalized = normalizeRelativePath(relativePath);
	const resolved = path.resolve(root, normalized);
	if (!isInsidePath(root, resolved)) {
		throw new Error("Path escapes the Software Factory workspace.");
	}
	return { normalized, resolved };
}

async function modifiedAt(filePath: string) {
	return (await stat(filePath).catch(() => undefined))?.mtime.toISOString();
}

async function readDocument(root: string, relativePath: string, title: string) {
	const { normalized, resolved } = resolveInside(root, relativePath);
	const fileStat = await stat(resolved).catch(() => undefined);
	if (!fileStat?.isFile()) {
		return { path: normalized, title, content: "", exists: false };
	}
	return {
		path: normalized,
		title,
		content: await readFile(resolved, "utf8"),
		exists: true,
		modifiedAt: fileStat.mtime.toISOString(),
	};
}

async function walkMarkdownFiles(root: string, relativeDir: string, depth = 0): Promise<string[]> {
	if (depth > 8) return [];
	const { resolved } = resolveInside(root, relativeDir);
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

function excerpt(raw: string) {
	return raw
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.slice(0, 5)
		.join("\n")
		.slice(0, 700);
}

function titleFromMarkdown(raw: string, fallback: string) {
	return raw.match(/^#\s+(.+)$/m)?.[1]?.trim() || fallback;
}

export class FactoryUiuxRuntime {
	private readonly root: string;

	constructor(root = findFactoryRoot()) {
		this.root = root;
	}

	async listScreensProposal(): Promise<UiuxSourceDocument[]> {
		return Promise.all([
			readDocument(this.root, `${UIUX_ROOT}/direction.md`, "Stage A Direction"),
			readDocument(this.root, `${UIUX_ROOT}/screens-proposal.md`, "Stage B Screens Proposal"),
		]);
	}

	async listStageCBriefs(): Promise<StageCBriefSummary[]> {
		return Promise.all(
			EXPECTED_STAGE_C_BRIEFS.map(async (brief) => {
				const canonical = resolveInside(this.root, brief.canonicalPath);
				const inferredPath = `${RUNS_ROOT}/wo-v0-deep-pass/per-surface/${brief.slug}/stage-c-brief-inferred.md`;
				const inferred = resolveInside(this.root, inferredPath);
				const canonicalExists = existsSync(canonical.resolved);
				const inferredExists = existsSync(inferred.resolved);
				return {
					...brief,
					canonicalExists,
					canonicalModifiedAt: await modifiedAt(canonical.resolved),
					inferredPath: inferred.normalized,
					inferredExists,
					inferredModifiedAt: await modifiedAt(inferred.resolved),
					status: canonicalExists
						? "canonical"
						: inferredExists
							? "inferred_available"
							: "missing",
				};
			}),
		);
	}

	async listUIUXValidationFindings(): Promise<UiuxValidationFinding[]> {
		const runsRoot = path.resolve(this.root, RUNS_ROOT);
		if (!existsSync(runsRoot)) return [];
		const candidates = await walkMarkdownFiles(this.root, RUNS_ROOT);
		const findings: UiuxValidationFinding[] = [];
		for (const relativePath of candidates) {
			if (!/uiux[-_ ]?validation/i.test(relativePath)) continue;
			const { resolved } = resolveInside(this.root, relativePath);
			const [raw, fileStat] = await Promise.all([readFile(resolved, "utf8"), stat(resolved)]);
			const parts = relativePath.split("/");
			const woId = parts[1] || "runs";
			findings.push({
				id: relativePath,
				path: relativePath,
				woId,
				title: titleFromMarkdown(raw, path.basename(relativePath, ".md")),
				modifiedAt: fileStat.mtime.toISOString(),
				excerpt: excerpt(raw),
			});
		}
		return findings.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
	}

	async readBrief(input: { path: string }): Promise<UiuxSourceDocument> {
		const normalized = normalizeRelativePath(input.path);
		const allowed =
			normalized.startsWith(`${SCREENS_ROOT}/`) ||
			normalized.startsWith(`${RUNS_ROOT}/wo-v0-deep-pass/per-surface/`) ||
			normalized.startsWith(`${RUNS_ROOT}/`);
		if (!allowed) {
			throw new Error("UIUX brief path is outside the read-only UIUX workspace.");
		}
		return readDocument(this.root, normalized, path.basename(normalized));
	}
}

let singleton: FactoryUiuxRuntime | undefined;

export const getFactoryUiuxRuntime = () => {
	if (!singleton) singleton = new FactoryUiuxRuntime();
	return singleton;
};
