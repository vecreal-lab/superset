import { observable } from "@trpc/server/observable";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { findFactoryRoot } from "main/lib/coordinator/prompt-loader";
import type {
	ComponentAuthoringHandoffFinding,
	DesignSystemComponentSummary,
	DesignSystemFileKind,
	DesignSystemFileRead,
	DesignSystemFileSummary,
	DesignSystemOverview,
	SpawnComponentWoResponse,
} from "lib/types/factory-design-system";
import { publicProcedure, router } from "lib/trpc";

const BRAND_ATOMS_ROOT = "projects/vecreal/drafts/brand-atoms";
const COMPONENT_LIBRARY_ROOT =
	"projects/vecreal/drafts/brand-atoms/component-library";
const COMPONENTS_ROOT =
	"vendor/superset-sh/apps/desktop/src/renderer/components/vecreal";

const CORE_BRAND_FILES: Array<{ path: string; label: string; kind: DesignSystemFileKind }> = [
	{
		path: `${BRAND_ATOMS_ROOT}/principles.md`,
		label: "principles.md",
		kind: "brand_foundation",
	},
	{
		path: `${BRAND_ATOMS_ROOT}/accessibility.md`,
		label: "accessibility.md",
		kind: "brand_foundation",
	},
	{
		path: `${BRAND_ATOMS_ROOT}/design-tokens.json`,
		label: "design-tokens.json",
		kind: "token_json",
	},
	{
		path: `${BRAND_ATOMS_ROOT}/reference-visual-mockups.html`,
		label: "reference-visual-mockups.html",
		kind: "reference_html",
	},
	{
		path: `${BRAND_ATOMS_ROOT}/reference-design-system.html`,
		label: "reference-design-system.html",
		kind: "reference_html",
	},
];

function normalizeRelativePath(input: string): string {
	return input.replace(/\\/g, "/").replace(/^\.\//, "");
}

function assertReadablePath(root: string, relativePath: string): string {
	const normalized = normalizeRelativePath(relativePath);
	const resolved = path.resolve(root, normalized);
	const allowedRoots = [
		path.resolve(root, BRAND_ATOMS_ROOT),
		path.resolve(root, COMPONENT_LIBRARY_ROOT),
		path.resolve(root, COMPONENTS_ROOT),
	];
	const insideAllowedRoot = allowedRoots.some(
		(allowedRoot) =>
			resolved === allowedRoot || resolved.startsWith(`${allowedRoot}${path.sep}`),
	);
	if (!insideAllowedRoot) {
		throw new Error("That design-system file is outside the read-only surface.");
	}
	return resolved;
}

function kindForPath(relativePath: string): DesignSystemFileKind {
	if (relativePath.endsWith(".html")) return "reference_html";
	if (relativePath.endsWith("design-tokens.json")) return "token_json";
	if (relativePath.includes("/component-library/") && relativePath.endsWith(".md")) {
		return "component_spec";
	}
	if (relativePath.endsWith(".preview.tsx")) return "component_preview";
	if (relativePath.endsWith(".test.tsx")) return "component_test";
	if (relativePath.endsWith(".tsx") || relativePath.endsWith(".ts")) {
		return "component_source";
	}
	if (relativePath.endsWith(".md")) return "brand_foundation";
	return "other";
}

async function fileSummary(
	root: string,
	relativePath: string,
	input: Partial<DesignSystemFileSummary> = {},
): Promise<DesignSystemFileSummary> {
	const normalized = normalizeRelativePath(relativePath);
	const absolute = assertReadablePath(root, normalized);
	const fileStat = await stat(absolute);
	return {
		id: normalized,
		label: path.basename(normalized),
		path: normalized,
		kind: kindForPath(normalized),
		group: normalized.startsWith(COMPONENTS_ROOT) ? "components" : "brand_atoms",
		modifiedAt: fileStat.mtime.toISOString(),
		...input,
	};
}

async function listBrandFiles(root: string): Promise<DesignSystemFileSummary[]> {
	const coreFiles = await Promise.all(
		CORE_BRAND_FILES.map((file) =>
			fileSummary(root, file.path, {
				label: file.label,
				kind: file.kind,
				group: file.kind === "reference_html" ? "references" : "brand_atoms",
			}),
		),
	);
	const componentDir = path.resolve(root, COMPONENT_LIBRARY_ROOT);
	const entries = await readdir(componentDir, { withFileTypes: true });
	const specs = await Promise.all(
		entries
			.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
			.map((entry) =>
				fileSummary(root, `${COMPONENT_LIBRARY_ROOT}/${entry.name}`, {
					kind: "component_spec",
					group: "brand_atoms",
				}),
			),
	);
	return [...coreFiles, ...specs].sort((a, b) => a.path.localeCompare(b.path));
}

async function listComponentFiles(
	root: string,
	componentName: string,
): Promise<DesignSystemFileSummary[]> {
	const componentRoot = `${COMPONENTS_ROOT}/${componentName}`;
	const absolute = path.resolve(root, componentRoot);
	const entries = await readdir(absolute, { withFileTypes: true }).catch(() => []);
	return Promise.all(
		entries
			.filter((entry) => entry.isFile())
			.map((entry) =>
				fileSummary(root, `${componentRoot}/${entry.name}`, {
					componentName,
					group: "components",
				}),
			),
	);
}

async function listComponents(root: string): Promise<DesignSystemComponentSummary[]> {
	const absolute = path.resolve(root, COMPONENTS_ROOT);
	const entries = await readdir(absolute, { withFileTypes: true }).catch(() => []);
	const components: DesignSystemComponentSummary[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const componentName = entry.name;
		const files = await listComponentFiles(root, componentName);
		const source = files.find((file) => file.path.endsWith(`/${componentName}.tsx`));
		const preview = files.find((file) => file.path.endsWith(".preview.tsx"));
		const test = files.find((file) => file.path.endsWith(".test.tsx"));
		components.push({
			name: componentName,
			status: source && preview ? "shipped" : "in_design",
			folderPath: `${COMPONENTS_ROOT}/${componentName}`,
			sourcePath: source?.path,
			previewPath: preview?.path,
			testPath: test?.path,
			specsCited:
				componentName === "StatusBadge"
					? [
							"projects/vecreal/drafts/brand-atoms/component-library/live-state-cues.md",
							"projects/vecreal/drafts/brand-atoms/component-library/notifications.md",
							"projects/vecreal/drafts/brand-atoms/accessibility.md",
						]
					: [],
		});
	}
	return components.sort((a, b) => a.name.localeCompare(b.name));
}

function extractField(raw: string, field: string): string | undefined {
	const pattern = new RegExp(`${field}:\\s*([^\\n]+)`);
	const match = pattern.exec(raw);
	return match?.[1]?.replace(/^["']|["']$/g, "").trim();
}

function extractList(raw: string, field: string): string[] {
	const line = extractField(raw, field);
	if (!line) return [];
	const inline = /^\[(.*)\]$/.exec(line);
	if (!inline) return [line].filter(Boolean);
	return inline[1]
		.split(",")
		.map((value) => value.replace(/^["'\s]+|["'\s]+$/g, ""))
		.filter(Boolean);
}

async function walkFiles(root: string, relativeDir: string): Promise<string[]> {
	const absolute = path.resolve(root, relativeDir);
	const entries = await readdir(absolute, { withFileTypes: true }).catch(() => []);
	const results: string[] = [];
	for (const entry of entries) {
		const child = `${relativeDir}/${entry.name}`;
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === ".git") continue;
			results.push(...(await walkFiles(root, child)));
			continue;
		}
		if (/\.(md|yml|yaml|json|jsonl)$/.test(entry.name)) results.push(child);
	}
	return results;
}

async function listHandoffs(root: string): Promise<ComponentAuthoringHandoffFinding[]> {
	const candidateFiles = await walkFiles(root, "runs");
	const findings: ComponentAuthoringHandoffFinding[] = [];
	for (const relativePath of candidateFiles) {
		const absolute = path.resolve(root, relativePath);
		const content = await readFile(absolute, "utf8").catch(() => "");
		if (!content.includes("component_authoring_handoff_finding")) continue;
		const componentName = extractField(content, "component_name") ?? "UnknownComponent";
		const currentState = extractField(content, "current_state") ?? "missing";
		findings.push({
			findingId:
				extractField(content, "finding_id") ??
				`handoff-${findings.length + 1}-${componentName}`,
			componentName,
			currentState:
				currentState === "partial" || currentState === "drift"
					? currentState
					: "missing",
			specsCited: extractList(content, "specs_cited"),
			proposedDesignIntent:
				extractField(content, "proposed_design_intent") ??
				"Component design intent needs COMPONENT_DESIGNER triage.",
			blockerForFeatureWo: extractField(content, "blocker_for_feature_wo") === "true",
			surfacedAt: extractField(content, "surfaced_at") ?? relativePath,
			surfacedByWo: extractField(content, "surfaced_by_wo"),
			sourceReceiptPath: relativePath,
			projectId: extractField(content, "project_id"),
		});
	}
	return findings;
}

async function overview(): Promise<DesignSystemOverview> {
	const root = findFactoryRoot();
	const [brandFiles, components, handoffs] = await Promise.all([
		listBrandFiles(root),
		listComponents(root),
		listHandoffs(root),
	]);
	const componentFiles = (
		await Promise.all(components.map((component) => listComponentFiles(root, component.name)))
	).flat();
	return {
		files: [...brandFiles, ...componentFiles],
		components,
		handoffs,
	};
}

export const createFactoryDesignSystemRouter = () =>
	router({
		overview: publicProcedure.query(async () => overview()),
		listSpecs: publicProcedure.query(async () => {
			const root = findFactoryRoot();
			return listBrandFiles(root);
		}),
		listComponents: publicProcedure.query(async () => {
			const root = findFactoryRoot();
			return listComponents(root);
		}),
		listHandoffs: publicProcedure.query(async () => {
			const root = findFactoryRoot();
			return listHandoffs(root);
		}),
		handoffs: publicProcedure.subscription(() =>
			observable<ComponentAuthoringHandoffFinding[]>((emit) => {
				let active = true;
				const publish = async () => {
					if (!active) return;
					emit.next(await listHandoffs(findFactoryRoot()));
				};
				void publish().catch((error) => emit.error(error));
				const interval = setInterval(() => {
					void publish().catch((error) => emit.error(error));
				}, 10_000);
				return () => {
					active = false;
					clearInterval(interval);
				};
			}),
		),
		readFile: publicProcedure
			.input(z.object({ path: z.string().min(1) }))
			.query(async ({ input }): Promise<DesignSystemFileRead> => {
				const root = findFactoryRoot();
				const normalized = normalizeRelativePath(input.path);
				const absolute = assertReadablePath(root, normalized);
				const [content, fileStat] = await Promise.all([
					readFile(absolute, "utf8"),
					stat(absolute),
				]);
				return {
					path: normalized,
					label: path.basename(normalized),
					kind: kindForPath(normalized),
					content,
					readonly: true,
					modifiedAt: fileStat.mtime.toISOString(),
				};
			}),
		spawnComponentWO: publicProcedure
			.input(
				z.object({
					componentName: z.string().min(1).max(120),
					intent: z.string().min(1).max(4_000),
					specPaths: z.array(z.string()).default([]),
					sourceFindingId: z.string().optional(),
				}),
			)
			.mutation(({ input }): SpawnComponentWoResponse => ({
				requiresOperatorConfirmation: true,
				pipelineVariant: "component_authoring",
				plainEnglishSummary: `${input.componentName} is ready to route into the component_authoring pipeline after operator confirmation.`,
				nextAction:
					"Review this request in Claude Desktop, then spawn the component_authoring WO through factory-mcp.",
				request: input,
			})),
	});
