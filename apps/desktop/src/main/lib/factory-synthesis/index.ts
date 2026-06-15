import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { findFactoryRoot } from "main/lib/coordinator/prompt-loader";

const RUNS_ROOT = "runs";

export interface SynthesisSummary {
	id: string;
	path: string;
	woId: string;
	title: string;
	project: string;
	modifiedAt: string;
	excerpt: string;
}

export interface SynthesisReadResult extends SynthesisSummary {
	content: string;
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
		throw new Error("Synthesis path is outside the runs receipt surface.");
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

function projectFromContent(raw: string, relativePath: string) {
	const explicit =
		raw.match(/\bproject(?:_id)?:\s*`?([A-Za-z0-9_-]+)`?/i)?.[1] ||
		raw.match(/\bProject:\s*([A-Za-z0-9_-]+)/i)?.[1];
	return explicit || (relativePath.includes("software-factory") ? "software-factory" : "factory");
}

function excerpt(raw: string) {
	return raw
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.slice(0, 8)
		.join("\n")
		.slice(0, 900);
}

function woIdFromPath(relativePath: string) {
	return relativePath.split("/")[1] || "runs";
}

export class FactorySynthesisRuntime {
	private readonly root: string;

	constructor(root = findFactoryRoot()) {
		this.root = root;
	}

	async listSyntheses(): Promise<SynthesisSummary[]> {
		const runsRoot = path.resolve(this.root, RUNS_ROOT);
		if (!existsSync(runsRoot)) return [];
		const files = (await walkMarkdownFiles(this.root, RUNS_ROOT)).filter((file) =>
			/synthesis/i.test(path.basename(file)),
		);
		const syntheses = await Promise.all(
			files.map(async (relativePath) => {
				const { resolved } = resolveRunPath(this.root, relativePath);
				const [raw, fileStat] = await Promise.all([readFile(resolved, "utf8"), stat(resolved)]);
				return {
					id: relativePath,
					path: relativePath,
					woId: woIdFromPath(relativePath),
					title: titleFromMarkdown(raw, path.basename(relativePath, ".md")),
					project: projectFromContent(raw, relativePath),
					modifiedAt: fileStat.mtime.toISOString(),
					excerpt: excerpt(raw),
				};
			}),
		);
		return syntheses.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
	}

	async getSynthesis(input: { path: string }): Promise<SynthesisReadResult> {
		const { normalized, resolved } = resolveRunPath(this.root, input.path);
		const [raw, fileStat] = await Promise.all([readFile(resolved, "utf8"), stat(resolved)]);
		return {
			id: normalized,
			path: normalized,
			woId: woIdFromPath(normalized),
			title: titleFromMarkdown(raw, path.basename(normalized, ".md")),
			project: projectFromContent(raw, normalized),
			modifiedAt: fileStat.mtime.toISOString(),
			excerpt: excerpt(raw),
			content: raw,
		};
	}
}

let singleton: FactorySynthesisRuntime | undefined;

export const getFactorySynthesisRuntime = () => {
	if (!singleton) singleton = new FactorySynthesisRuntime();
	return singleton;
};
