import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { findFactoryRoot } from "main/lib/coordinator/prompt-loader";

const BRAND_ATOMS_ROOT = "projects/vecreal/drafts/brand-atoms";
const READABLE_EXTENSIONS = new Set([".md", ".json", ".html"]);

export type BrandAtomFileKind = "markdown" | "json" | "html" | "other";

export interface BrandAtomFileSummary {
	id: string;
	path: string;
	label: string;
	kind: BrandAtomFileKind;
	depth: number;
	size: number;
	modifiedAt: string;
	factoryUrl: string;
}

export interface BrandAtomReadResult extends BrandAtomFileSummary {
	content: string;
	readonly: true;
}

export interface KnownGapSummary {
	id: string;
	title: string;
	severity: "info" | "warning" | "blocker";
	status: "open" | "in_progress" | "closed" | "unknown";
	line: number;
	sourcePath: string;
}

const normalizeSlashes = (value: string) => value.replace(/\\/g, "/");

const normalizeRelativePath = (input: string) =>
	normalizeSlashes(input).replace(/^\.\//, "").replace(/^\/+/, "");

const isInsidePath = (base: string, candidate: string) => {
	const relative = path.relative(base, candidate);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const encodeFactoryPath = (relativePath: string) =>
	`factory:///${normalizeRelativePath(relativePath)
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/")}`;

function kindForPath(relativePath: string): BrandAtomFileKind {
	const extension = path.extname(relativePath).toLowerCase();
	if (extension === ".md") return "markdown";
	if (extension === ".json") return "json";
	if (extension === ".html") return "html";
	return "other";
}

function resolveBrandAtomPath(root: string, relativePath: string) {
	const normalized = normalizeRelativePath(relativePath);
	const brandRoot = path.resolve(root, BRAND_ATOMS_ROOT);
	const resolved = path.resolve(root, normalized);
	if (!isInsidePath(brandRoot, resolved)) {
		throw new Error("Brand atom path is outside the read-only Path A surface.");
	}
	return { normalized, resolved };
}

async function walkBrandAtomFiles(
	root: string,
	relativeDir = BRAND_ATOMS_ROOT,
	depth = 0,
): Promise<string[]> {
	if (depth > 8) return [];
	const absoluteDir = path.resolve(root, relativeDir);
	const entries = await readdir(absoluteDir, { withFileTypes: true }).catch(() => []);
	const files: string[] = [];
	for (const entry of entries) {
		const child = `${relativeDir}/${entry.name}`;
		if (entry.isDirectory()) {
			if (entry.name === ".git" || entry.name === "node_modules") continue;
			files.push(...(await walkBrandAtomFiles(root, child, depth + 1)));
			continue;
		}
		if (entry.isFile() && READABLE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
			files.push(normalizeRelativePath(child));
		}
	}
	return files;
}

async function fileSummary(root: string, relativePath: string): Promise<BrandAtomFileSummary> {
	const { normalized, resolved } = resolveBrandAtomPath(root, relativePath);
	const fileStat = await stat(resolved);
	return {
		id: normalized,
		path: normalized,
		label: path.basename(normalized),
		kind: kindForPath(normalized),
		depth: normalizeRelativePath(path.relative(path.resolve(root, BRAND_ATOMS_ROOT), resolved))
			.split("/")
			.filter(Boolean).length,
		size: fileStat.size,
		modifiedAt: fileStat.mtime.toISOString(),
		factoryUrl: encodeFactoryPath(normalized),
	};
}

function severityForLine(line: string): KnownGapSummary["severity"] {
	const lower = line.toLowerCase();
	if (/\b(blocker|critical|p0)\b/.test(lower)) return "blocker";
	if (/\b(warning|risk|p1|p2)\b/.test(lower)) return "warning";
	return "info";
}

function statusForLine(line: string): KnownGapSummary["status"] {
	const lower = line.toLowerCase();
	if (/\b(done|closed|resolved)\b/.test(lower)) return "closed";
	if (/\b(in progress|in-progress|active)\b/.test(lower)) return "in_progress";
	if (/\b(open|todo|pending)\b/.test(lower)) return "open";
	return "unknown";
}

function cleanGapTitle(line: string) {
	return line
		.replace(/^\s*[-*]\s*/, "")
		.replace(/^\s*\d+[.)]\s*/, "")
		.replace(/\*\*/g, "")
		.trim();
}

export class FactoryDesignRuntime {
	private readonly root: string;

	constructor(root = findFactoryRoot()) {
		this.root = root;
	}

	async listBrandAtoms(): Promise<BrandAtomFileSummary[]> {
		const brandRoot = path.resolve(this.root, BRAND_ATOMS_ROOT);
		if (!existsSync(brandRoot)) return [];
		const files = await walkBrandAtomFiles(this.root);
		const summaries = await Promise.all(files.map((file) => fileSummary(this.root, file)));
		return summaries.sort((left, right) => left.path.localeCompare(right.path));
	}

	async readBrandAtom(input: { path: string }): Promise<BrandAtomReadResult> {
		const summary = await fileSummary(this.root, input.path);
		const { resolved } = resolveBrandAtomPath(this.root, summary.path);
		const content = await readFile(resolved, "utf8");
		return { ...summary, content, readonly: true };
	}

	async listKnownGaps(): Promise<KnownGapSummary[]> {
		const sourcePath = `${BRAND_ATOMS_ROOT}/known-gaps.md`;
		const { resolved } = resolveBrandAtomPath(this.root, sourcePath);
		const raw = await readFile(resolved, "utf8").catch(() => "");
		return raw
			.split(/\r?\n/)
			.map((line, index) => ({ line, lineNumber: index + 1 }))
			.filter(({ line }) => /^\s*(?:[-*]|\d+[.)])\s+/.test(line))
			.map(({ line, lineNumber }, index) => ({
				id: `brand-gap-${lineNumber}-${index}`,
				title: cleanGapTitle(line),
				severity: severityForLine(line),
				status: statusForLine(line),
				line: lineNumber,
				sourcePath,
			}))
			.filter((gap) => gap.title.length > 0);
	}
}

let singleton: FactoryDesignRuntime | undefined;

export const getFactoryDesignRuntime = () => {
	if (!singleton) singleton = new FactoryDesignRuntime();
	return singleton;
};
