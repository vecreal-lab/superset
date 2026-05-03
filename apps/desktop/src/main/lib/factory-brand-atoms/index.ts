import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import type {
	BrandAtomConsumer,
	BrandAtomCoverage,
	BrandAtomGapFinding,
	BrandAtomListItem,
	BrandAtomType,
	CssVariableUsage,
	WorkspaceContext,
} from "lib/types/factory-operator-console";

export type AtomConsumptionMap = Record<string, string[]>;

export interface BrandAtomStoreOptions {
	root?: string;
	workspaceContext?: WorkspaceContext;
	brandAtomsProjectId?: string;
}

interface WorkOrderRecord {
	id: string;
	title: string;
	status?: string;
	last_updated?: string;
	source_relative_path: string;
	cites: string[];
}

interface ParsedYaml {
	scalars: Record<string, string>;
	arrays: Record<string, string[]>;
}

const BRAND_ATOMS_PROJECT_ID = "vecreal";
const BRAND_ATOMS_RELATIVE_SUFFIX = path.join("drafts", "brand-atoms");
const BRAND_ATOMS_RELATIVE = "projects/vecreal/drafts/brand-atoms";
const TEXT_EXTENSIONS = new Set([
	".css",
	".html",
	".js",
	".json",
	".jsx",
	".md",
	".mjs",
	".ts",
	".tsx",
	".yaml",
	".yml",
]);

const normalizeSlashes = (value: string) => value.replace(/\\/g, "/");

const stripYamlScalar = (value: string) => {
	const withoutComment = value.replace(/\s+#.*$/, "").trim();
	if (
		(withoutComment.startsWith('"') && withoutComment.endsWith('"')) ||
		(withoutComment.startsWith("'") && withoutComment.endsWith("'"))
	) {
		return withoutComment.slice(1, -1);
	}
	return withoutComment.replace(/^`+|`+$/g, "").replace(/^<|>$/g, "").trim();
};

const normalizeRelativePath = (value: string) =>
	normalizeSlashes(value).replace(/^\.\//, "").replace(/^\/+/, "");

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

const modifiedAt = async (filePath: string) => {
	try {
		return (await stat(filePath)).mtime.toISOString();
	} catch {
		return undefined;
	}
};

const parseShallowYaml = (raw: string): ParsedYaml => {
	const scalars: Record<string, string> = {};
	const arrays: Record<string, string[]> = {};
	let currentArrayKey: string | undefined;

	for (const line of raw.split(/\r?\n/)) {
		if (!line.trim() || line.trimStart().startsWith("#")) continue;

		const topLevel = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
		if (topLevel) {
			const key = topLevel[1];
			const value = topLevel[2] || "";
			currentArrayKey = undefined;
			if (value.trim().startsWith("[")) {
				arrays[key] = value
					.replace(/^\[/, "")
					.replace(/\].*$/, "")
					.split(",")
					.map(stripYamlScalar)
					.filter(Boolean);
			} else if (!value.trim()) {
				currentArrayKey = key;
				arrays[key] ||= [];
			} else if (["|", ">", "|-", ">-"].includes(value.trim())) {
				scalars[key] = "";
			} else {
				scalars[key] = stripYamlScalar(value);
			}
			continue;
		}

		const arrayItem = /^\s*-\s+(.*)$/.exec(line);
		if (currentArrayKey && arrayItem) {
			const value = stripYamlScalar(arrayItem[1] || "");
			if (value) arrays[currentArrayKey].push(value);
		}
	}

	return { scalars, arrays };
};

const atomTypeFor = (atomRelativePath: string): BrandAtomType => {
	const normalized = normalizeRelativePath(atomRelativePath);
	const basename = path.basename(normalized).toLowerCase();
	if (normalized.includes("/component-library/")) return "component-spec";
	if (basename.endsWith(".html")) return "html-reference";
	if (basename === "design-tokens.json") return "token";
	if (basename === "principles.md") return "principle";
	if (basename === "brand-voice.md") return "voice";
	if (basename === "accessibility.md") return "accessibility";
	if (basename === "iconography.md") return "iconography";
	if (basename.includes("gap")) return "gap";
	if (basename.includes("curation")) return "workflow";
	return "other";
};

const stableFindingId = (parts: string[]) =>
	`atoms-gap-${createHash("sha1").update(parts.join("\n")).digest("hex").slice(0, 12)}`;

const normalizePatternName = (value: string) =>
	value
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "");

const pascalFromSlug = (slug: string) =>
	slug
		.split(/[-_]+/g)
		.filter(Boolean)
		.map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
		.join("");

const extractComponentCandidates = (filePath: string, content: string) => {
	const names = new Set<string>();
	const base = path.basename(filePath, path.extname(filePath));
	if (/^[A-Z]/.test(base)) names.add(base);

	for (const match of content.matchAll(/\b(?:function|class)\s+([A-Z][A-Za-z0-9_]*)/g)) {
		if (match[1]) names.add(match[1]);
	}
	for (const match of content.matchAll(/\bconst\s+([A-Z][A-Za-z0-9_]*)\s*=/g)) {
		if (match[1]) names.add(match[1]);
	}
	for (const match of content.matchAll(/<([A-Z][A-Za-z0-9_.]*)\b/g)) {
		if (match[1]) names.add(match[1].split(".")[0] || match[1]);
	}

	return [...names];
};

export function detectAtomGapFindingsForContent(input: {
	filePath: string;
	content: string;
	componentSpecPaths: string[];
	brandAtomCitations?: string[];
}): BrandAtomGapFinding[] {
	const findings: BrandAtomGapFinding[] = [];
	const normalizedPath = normalizeRelativePath(input.filePath);
	const hexMatches = input.content.match(/(^|[^A-Za-z0-9_-])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![A-Za-z0-9_-])/g) || [];
	const citations = input.brandAtomCitations || [];

	if (hexMatches.length > 0) {
		const description = `Raw hex color literal introduced in ${normalizedPath}.`;
		findings.push({
			finding_id: stableFindingId(["blocker", normalizedPath, description]),
			severity: "blocker",
			rule: "hex-literal",
			pattern_description: description,
			introduced_at: normalizedPath,
			rationale: "Brand atoms require CSS variables from design-tokens.json instead of raw hex literals.",
			follow_on_action: "Replace the literal with an existing token before merge",
			surfaced_to_curator: true,
		});
	}

	if (citations.length === 0) {
		const description = `UI implementation changed without a brand atoms citation.`;
		findings.push({
			finding_id: stableFindingId(["blocker", normalizedPath, description]),
			severity: "blocker",
			rule: "missing-citation",
			pattern_description: description,
			introduced_at: normalizedPath,
			rationale: "The curation policy makes missing citations blocker-class for UI substages.",
			follow_on_action: "Cite the consumed brand atom specs before merge",
			surfaced_to_curator: true,
		});
	}

	const specAliases = input.componentSpecPaths.map((specPath) => {
		const slug = path.basename(specPath, path.extname(specPath));
		return {
			specPath: normalizeRelativePath(specPath),
			aliases: [slug, pascalFromSlug(slug)].map(normalizePatternName),
		};
	});

	for (const componentName of extractComponentCandidates(normalizedPath, input.content)) {
		const normalizedName = normalizePatternName(componentName);
		const matched = specAliases.some((spec) =>
			spec.aliases.some((alias) => alias && normalizedName.includes(alias)),
		);
		if (matched) continue;

		const description = `Component pattern "${componentName}" has no matching brand atom component spec.`;
		findings.push({
			finding_id: stableFindingId(["info", normalizedPath, componentName, description]),
			severity: "info",
			rule: "spec-match",
			pattern_description: description,
			introduced_at: normalizedPath,
			rationale: "Heuristic component-name matching found no component-library spec. If the pattern is mockup-approved, log it for Path A curation.",
			follow_on_action: "Add to atoms via Path A",
			surfaced_to_curator: true,
		});
	}

	return findings;
}

export class FactoryBrandAtomsStore {
	private readonly root: string;
	private readonly workspaceContext?: WorkspaceContext;
	private readonly brandAtomsProjectId: string;

	constructor(options: BrandAtomStoreOptions = {}) {
		this.root = path.resolve(options.root || findFactoryRoot());
		this.workspaceContext = options.workspaceContext;
		this.brandAtomsProjectId = options.brandAtomsProjectId || BRAND_ATOMS_PROJECT_ID;
	}

	async scanAtomConsumption(): Promise<AtomConsumptionMap> {
		const workOrders = await this.readWorkOrders();
		const consumption = new Map<string, Set<string>>();

		for (const workOrder of workOrders) {
			for (const citation of workOrder.cites) {
				for (const atomPath of await this.expandAtomCitation(citation)) {
					if (!consumption.has(atomPath)) consumption.set(atomPath, new Set());
					consumption.get(atomPath)?.add(workOrder.id);
				}
			}
		}

		return Object.fromEntries(
			[...consumption.entries()]
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([atomPath, consumers]) => [atomPath, [...consumers].sort()]),
		);
	}

	async getAtomConsumers(atomPath: string): Promise<BrandAtomConsumer[]> {
		const normalizedAtomPath = this.normalizeAtomInput(atomPath);
		const consumption = await this.scanAtomConsumption();
		const consumerIds = new Set(consumption[normalizedAtomPath] || []);
		if (consumerIds.size === 0) return [];

		return (await this.readWorkOrders())
			.filter((workOrder) => consumerIds.has(workOrder.id))
			.map((workOrder) => ({
				wo_id: workOrder.id,
				status: workOrder.status,
				title: workOrder.title,
				last_updated: workOrder.last_updated,
				source_relative_path: workOrder.source_relative_path,
			}))
			.sort((left, right) => left.wo_id.localeCompare(right.wo_id));
	}

	async getAtomCoverage(): Promise<BrandAtomCoverage> {
		const atoms = await this.listAtoms();
		const consumption = await this.scanAtomConsumption();
		const atomsWithoutConsumers = atoms
			.map((atom) => atom.atom_path)
			.filter((atomPath) => (consumption[atomPath] || []).length === 0)
			.sort();
		const topConsumedAtoms = Object.entries(consumption)
			.map(([atomPath, consumers]) => ({
				atom_path: atomPath,
				consumer_count: consumers.length,
				consumers,
			}))
			.sort((left, right) => {
				if (right.consumer_count !== left.consumer_count) {
					return right.consumer_count - left.consumer_count;
				}
				return left.atom_path.localeCompare(right.atom_path);
			})
			.slice(0, 20);

		return {
			total_atoms: atoms.length,
			atoms_with_consumers: atoms.length - atomsWithoutConsumers.length,
			atoms_without_consumers: atomsWithoutConsumers,
			top_consumed_atoms: topConsumedAtoms,
		};
	}

	async listAtoms(): Promise<BrandAtomListItem[]> {
		const atomRoot = this.brandAtomsRoot();
		const files = await this.walkFiles(atomRoot);
		const consumption = await this.scanAtomConsumption();
		const atoms = await Promise.all(
			files.map(async (filePath) => {
				const atomPath = this.relativeToRoot(filePath);
				return {
					atom_path: atomPath,
					path: filePath,
					type: atomTypeFor(atomPath),
					name: path.basename(filePath),
					modified_at: await modifiedAt(filePath),
					consumer_count: (consumption[atomPath] || []).length,
				};
			}),
		);

		return atoms.sort((left, right) => {
			if (left.type !== right.type) return left.type.localeCompare(right.type);
			return left.atom_path.localeCompare(right.atom_path);
		});
	}

	async getAtomGapFindings(): Promise<BrandAtomGapFinding[]> {
		const runsRoot = path.join(this.root, "runs");
		if (!existsSync(runsRoot)) return [];

		const files = (await this.walkFiles(runsRoot))
			.filter((filePath) => {
				const extension = path.extname(filePath).toLowerCase();
				return extension === ".json" || extension === ".md";
			})
			.filter((filePath) => !this.relativeToRoot(filePath).includes("/worktree/"));
		const findings: BrandAtomGapFinding[] = [];

		for (const filePath of files) {
			const sourceReceipt = this.relativeToRoot(filePath);
			const raw = await readText(filePath);
			const parsed = this.parseReceiptForGapFindings(raw, sourceReceipt);
			findings.push(...parsed);
		}

		const deduped = new Map<string, BrandAtomGapFinding>();
		for (const finding of findings) {
			if (finding.resolved_by_atom_commit) continue;
			deduped.set(finding.finding_id, finding);
		}
		return [...deduped.values()].sort((left, right) =>
			`${left.severity}:${left.introduced_at}`.localeCompare(`${right.severity}:${right.introduced_at}`),
		);
	}

	async getCssVariableUsage(tokenName: string): Promise<CssVariableUsage> {
		const normalized = tokenName
			.trim()
			.replace(/^var\(\s*/, "")
			.replace(/\).*$/, "")
			.replace(/^--/, "");
		const variableName = `--${normalized}`;
		const searchRoot = path.join(this.root, "vendor", "superset-sh");
		const files = (await this.walkFiles(searchRoot))
			.filter((filePath) => TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase()))
			.filter((filePath) => !this.relativeToRoot(filePath).includes("/node_modules/"));
		const usages: CssVariableUsage["usages"] = [];

		for (const filePath of files) {
			const content = await readText(filePath);
			if (!content.includes(variableName)) continue;
			content.split(/\r?\n/).forEach((line, index) => {
				if (line.includes(variableName)) {
					usages.push({
						file_path: this.relativeToRoot(filePath),
						line: index + 1,
						preview: line.trim().slice(0, 240),
					});
				}
			});
		}

		return {
			token_name: normalized,
			variable_name: variableName,
			total_matches: usages.length,
			usages: usages.slice(0, 250),
		};
	}

	private projectsRoot() {
		const candidate = this.workspaceContext?.projectsRoot
			? path.resolve(this.workspaceContext.projectsRoot)
			: path.join(this.root, "projects");
		if (!isInsidePath(this.root, candidate)) {
			throw new Error(`Workspace projectsRoot must stay inside repo: ${candidate}`);
		}
		return candidate;
	}

	private brandAtomsRoot() {
		return path.join(
			this.projectsRoot(),
			this.brandAtomsProjectId,
			BRAND_ATOMS_RELATIVE_SUFFIX,
		);
	}

	private relativeToRoot(filePath: string) {
		return normalizeRelativePath(path.relative(this.root, filePath));
	}

	private normalizeAtomInput(atomPath: string) {
		const normalized = normalizeRelativePath(atomPath);
		if (normalized.startsWith(BRAND_ATOMS_RELATIVE)) return normalized;
		const absolute = path.resolve(atomPath);
		if (isInsidePath(this.root, absolute)) return this.relativeToRoot(absolute);
		return normalizeRelativePath(path.join(BRAND_ATOMS_RELATIVE, normalized));
	}

	private async readWorkOrders(): Promise<WorkOrderRecord[]> {
		const workOrdersRoot = path.join(this.root, "work-orders");
		if (!existsSync(workOrdersRoot)) return [];
		const entries = await readdir(workOrdersRoot, { withFileTypes: true });
		const files = entries
			.filter((entry) => entry.isFile() && /\.(ya?ml)$/i.test(entry.name))
			.map((entry) => path.join(workOrdersRoot, entry.name));

		const workOrders = await Promise.all(
			files.map(async (filePath) => {
				const raw = await readText(filePath);
				const parsed = parseShallowYaml(raw);
				const fallbackId = path.basename(filePath, path.extname(filePath));
				return {
					id: parsed.scalars.id || fallbackId,
					title: parsed.scalars.title || parsed.scalars.name || fallbackId,
					status: parsed.scalars.status,
					last_updated:
						parsed.scalars.last_updated ||
						parsed.scalars.updated_at ||
						parsed.scalars.created ||
						(await modifiedAt(filePath)),
					source_relative_path: this.relativeToRoot(filePath),
					cites: parsed.arrays.cites || [],
				};
			}),
		);

		return workOrders.sort((left, right) => left.id.localeCompare(right.id));
	}

	private async expandAtomCitation(citation: string): Promise<string[]> {
		const normalized = normalizeRelativePath(stripYamlScalar(citation));
		if (!normalized.startsWith(BRAND_ATOMS_RELATIVE)) return [];

		const globPrefix = normalized.replace(/\*\*.*$/, "").replace(/\/+$/, "");
		const target = resolveInside(this.root, globPrefix);
		if (normalized.includes("**") || normalized.endsWith("/") || this.isDirectory(target)) {
			return (await this.walkFiles(target))
				.map((filePath) => this.relativeToRoot(filePath))
				.filter((filePath) => filePath.startsWith(BRAND_ATOMS_RELATIVE));
		}

		return existsSync(target) ? [this.relativeToRoot(target)] : [normalized];
	}

	private isDirectory(filePath: string) {
		try {
			return existsSync(filePath) && path.extname(filePath) === "";
		} catch {
			return false;
		}
	}

	private async walkFiles(root: string, depth = 0): Promise<string[]> {
		if (depth > 12 || !existsSync(root)) return [];
		const entries = await readdir(root, { withFileTypes: true });
		const files: string[] = [];
		for (const entry of entries) {
			if (
				entry.name === ".git" ||
				entry.name === "node_modules" ||
				entry.name === "dist" ||
				entry.name === "release"
			) {
				continue;
			}
			const entryPath = path.join(root, entry.name);
			if (entry.isDirectory()) {
				files.push(...(await this.walkFiles(entryPath, depth + 1)));
			} else if (entry.isFile()) {
				files.push(entryPath);
			}
		}
		return files;
	}

	private parseReceiptForGapFindings(
		raw: string,
		sourceReceipt: string,
	): BrandAtomGapFinding[] {
		if (!raw.trim()) return [];
		const json = this.tryParseJson(raw);
		const findings = json
			? this.normalizeReceiptGapFindings(json, sourceReceipt)
			: this.parseMarkdownGapFindings(raw, sourceReceipt);
		return findings;
	}

	private normalizeReceiptGapFindings(
		raw: unknown,
		sourceReceipt: string,
	): BrandAtomGapFinding[] {
		const receipt = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
		const runId = typeof receipt.run_id === "string" ? receipt.run_id : undefined;
		const workOrderId =
			typeof receipt.work_order_id === "string" ? receipt.work_order_id : undefined;
		const rawFindings = Array.isArray(receipt.atoms_gap_findings)
			? receipt.atoms_gap_findings
			: [];
		return rawFindings
			.map((finding) =>
				this.normalizeGapFinding(finding, sourceReceipt, runId, workOrderId),
			)
			.filter((finding): finding is BrandAtomGapFinding => Boolean(finding));
	}

	private parseMarkdownGapFindings(
		raw: string,
		sourceReceipt: string,
	): BrandAtomGapFinding[] {
		if (!raw.includes("atoms_gap_findings")) return [];
		const blocks = raw.split(/\n\s*-\s+finding_id:\s*/).slice(1);
		return blocks
			.map((block) => {
				const field = (name: string) =>
					block.match(new RegExp(`^\\s*${name}:\\s*(.+)$`, "m"))?.[1]?.trim();
				const findingId = block.split(/\r?\n/)[0]?.trim();
				if (!findingId) return undefined;
				return this.normalizeGapFinding(
					{
						finding_id: findingId,
						severity: field("severity") || "info",
						pattern_description: field("pattern_description") || "Receipt logged an atoms gap.",
						introduced_at: field("introduced_at") || "",
						rationale: field("rationale") || "",
						follow_on_action: field("follow_on_action") || "Add to atoms via Path A",
						surfaced_to_curator: true,
					},
					sourceReceipt,
				);
			})
			.filter((finding): finding is BrandAtomGapFinding => Boolean(finding));
	}

	private normalizeGapFinding(
		raw: unknown,
		sourceReceipt: string,
		runId?: string,
		workOrderId?: string,
	): BrandAtomGapFinding | undefined {
		const finding = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
		const severity = String(finding.severity || "info");
		if (!["info", "warning", "blocker"].includes(severity)) return undefined;
		const description = String(
			finding.pattern_description || finding.description || "Brand atoms gap finding.",
		);
		const introducedAt = normalizeRelativePath(String(finding.introduced_at || ""));
		return {
			finding_id:
				String(finding.finding_id || "") ||
				stableFindingId([severity, introducedAt, description, sourceReceipt]),
			severity: severity as BrandAtomGapFinding["severity"],
			rule: finding.rule ? String(finding.rule) : undefined,
			pattern_description: description,
			introduced_at: introducedAt,
			rationale: String(finding.rationale || ""),
			follow_on_action: String(finding.follow_on_action || "Add to atoms via Path A"),
			surfaced_to_curator:
				typeof finding.surfaced_to_curator === "boolean"
					? finding.surfaced_to_curator
					: true,
			source_receipt: sourceReceipt,
			run_id: runId || (finding.run_id ? String(finding.run_id) : undefined),
			work_order_id:
				workOrderId ||
				(finding.work_order_id ? String(finding.work_order_id) : undefined),
			resolved_by_atom_commit: finding.resolved_by_atom_commit
				? String(finding.resolved_by_atom_commit)
				: undefined,
		};
	}

	private tryParseJson(raw: string) {
		try {
			return JSON.parse(raw);
		} catch {
			return undefined;
		}
	}
}

let singleton: FactoryBrandAtomsStore | undefined;

export const getFactoryBrandAtomsStore = () => {
	if (!singleton) {
		singleton = new FactoryBrandAtomsStore();
	}
	return singleton;
};
