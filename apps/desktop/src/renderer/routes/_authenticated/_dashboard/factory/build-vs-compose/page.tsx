import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer/MarkdownRenderer";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useActiveProjectId } from "renderer/stores/active-project";
import {
	DocumentSheet,
	EmptyFactoryState,
	SourceButton,
	formatDate,
	type FactoryRow,
} from "../components/FactoryView";
import {
	LDPSurface,
	useLDPSurfaceDialogue,
	type LDPDialogueAgent,
	type LDPStatusSummary,
} from "../components/LDPSurface";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/build-vs-compose/",
)({
	validateSearch: (search) => ({
		dialogueId:
			typeof search.dialogueId === "string" ? search.dialogueId : undefined,
	}),
	component: BuildVsComposePage,
});

const BUILD_COMPOSE_AGENT: LDPDialogueAgent = {
	name: "LANDSCAPE_ANALYST",
	roleId: "LANDSCAPE_ANALYST",
	description:
		"Primary Build-vs-Compose steward. STRATEGY_STEWARD is attributed on positioning impact.",
};

interface MatrixRow {
	subsystem: string;
	name: string;
	status: string;
	reasoning: string;
	vendorInputs: string;
	owner: string;
	risk: string;
	fallback: string;
	lastReviewed: string;
}

function parseMarkdownTable(content: string): MatrixRow[] {
	const lines = content.split(/\r?\n/).filter((line) => line.trim().startsWith("|"));
	if (lines.length < 3) return [];
	const dataLines = lines.slice(2);
	return dataLines
		.map((line) =>
			line
				.split("|")
				.slice(1, -1)
				.map((cell) => cell.trim()),
		)
		.filter((cells) => cells.length >= 4)
		.map((cells) => ({
			subsystem: cells[0] || "unknown",
			name: cells[1] || cells[0] || "Unnamed subsystem",
			status: cells[2] || "Monitor",
			reasoning: cells[3] || "",
			vendorInputs: cells[4] || "None cited",
			owner: cells[5] || "Not recorded",
			risk: cells[6] || "Not recorded",
			fallback: cells[7] || "Not recorded",
			lastReviewed: cells[8] || "Not recorded",
		}));
}

function BuildVsComposePage() {
	const [selectedSource, setSelectedSource] = useState<string | null>(null);
	const [sheetSource, setSheetSource] = useState<string | null>(null);
	const activeProjectId = useActiveProjectId();
	const search = Route.useSearch();
	const navigate = useNavigate();
	const foundations = electronTrpc.factory.dataset.useQuery(
		{ dataset: "foundations" },
		{ refetchInterval: 5000 },
	);
	const matrices = useMemo(
		() =>
			(foundations.data || []).filter(
				(row: FactoryRow) =>
					row.source_relative_path.includes(`projects/${activeProjectId}/`) &&
					row.source_relative_path.endsWith("build-vs-compose-matrix.md"),
			),
		[activeProjectId, foundations.data],
	);
	useEffect(() => {
		if (!selectedSource && matrices[0]) setSelectedSource(matrices[0].source_relative_path);
	}, [matrices, selectedSource]);
	const selectedDocument = electronTrpc.factory.document.useQuery(
		{ path: selectedSource || "" },
		{ enabled: !!selectedSource },
	);
	const ldp = useLDPSurfaceDialogue({
		project: activeProjectId,
		surface: "build-vs-compose",
		title: "Build-vs-Compose dialogue",
		initialDialogueId: search.dialogueId,
		documentPath: selectedSource || undefined,
		onDialogueIdChange: (dialogueId) =>
			navigate({
				to: "/factory/build-vs-compose",
				search: { dialogueId },
				replace: true,
			}),
	});
	const matrixRows = useMemo(
		() => parseMarkdownTable(selectedDocument.data?.content || ""),
		[selectedDocument.data?.content],
	);
	const decisionCounts = matrixRows.reduce<Record<string, number>>((acc, row) => {
		const key = row.status || "Unknown";
		acc[key] = (acc[key] || 0) + 1;
		return acc;
	}, {});
	const buildLeaning = matrixRows.filter((row) =>
		/build/i.test(row.status),
	).length;
	const monitorLeaning = matrixRows.filter((row) =>
		/monitor/i.test(row.status),
	).length;
	const status: LDPStatusSummary = {
		kind: "read_model",
		label: "Build vs Compose",
		state: ldp.state,
		sourcePath: selectedDocument.data?.source_relative_path || selectedSource || undefined,
		lastUpdated: formatDate(selectedDocument.data?.modified_at),
		primaryAgent: BUILD_COMPOSE_AGENT.roleId,
		metrics: [
			{ label: "Matrix files", value: matrices.length },
			{ label: "Subsystem rows", value: matrixRows.length },
			{ label: "Build-leaning", value: buildLeaning },
			{ label: "Monitor-leaning", value: monitorLeaning },
		],
		flags: [
			{ label: `Active project: ${activeProjectId}` },
			{ label: "STRATEGY_STEWARD positioning impact" },
			{ label: Object.keys(decisionCounts).slice(0, 3).join(", ") || "No decisions" },
		],
	};

	const readPane = (
		<div className="grid min-h-[32rem] grid-cols-[18rem_minmax(0,1fr)] overflow-hidden rounded-md border">
			<aside className="min-h-0 border-r p-3">
				<div className="mb-3 text-xs font-medium uppercase text-muted-foreground">
					Matrix files
				</div>
				{matrices.length ? (
					matrices.map((row: FactoryRow) => (
						<Button
							key={row.source_relative_path}
							type="button"
							variant={row.source_relative_path === selectedSource ? "secondary" : "ghost"}
							className="mb-1 h-auto w-full justify-start px-2 py-2 text-left"
							onClick={() => setSelectedSource(row.source_relative_path)}
						>
							<span className="min-w-0">
								<span className="block truncate text-sm">{row.title}</span>
								<span className="block truncate font-mono text-xs text-muted-foreground">
									{row.source_relative_path}
								</span>
							</span>
						</Button>
					))
				) : (
					<div className="text-sm text-muted-foreground">No project matrices yet.</div>
				)}
			</aside>
			<main className="min-h-0 overflow-y-auto p-5">
				{selectedDocument.data ? (
					<div className="space-y-4">
						<div className="flex items-start justify-between gap-4 border-b pb-4">
							<div className="min-w-0">
								<h2 className="truncate text-xl font-semibold">
									{selectedDocument.data.source_relative_path}
								</h2>
								<p className="mt-1 text-sm text-muted-foreground">
									Last reviewed {formatDate(selectedDocument.data.modified_at)}
								</p>
							</div>
							<SourceButton
								path={selectedDocument.data.source_relative_path}
								onOpen={setSheetSource}
							/>
						</div>
						{matrixRows.length ? (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Subsystem</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Reasoning</TableHead>
										<TableHead>Vendor inputs</TableHead>
										<TableHead>Owner / risk / fallback</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{matrixRows.map((row) => (
										<TableRow key={`${row.subsystem}-${row.name}`}>
											<TableCell className="max-w-56 whitespace-normal">
												<div className="font-medium">{row.name}</div>
												<div className="font-mono text-xs text-muted-foreground">
													{row.subsystem}
												</div>
											</TableCell>
											<TableCell>
												<Badge variant="outline">{row.status}</Badge>
											</TableCell>
											<TableCell className="max-w-sm whitespace-normal">
												{row.reasoning}
											</TableCell>
											<TableCell className="max-w-sm whitespace-normal">
												{row.vendorInputs}
											</TableCell>
											<TableCell className="max-w-sm whitespace-normal text-xs">
												<div>{row.owner}</div>
												<div className="mt-1 text-muted-foreground">{row.risk}</div>
												<div className="mt-1 text-muted-foreground">{row.fallback}</div>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						) : (
							<MarkdownRenderer
								content={selectedDocument.data.content}
								className="h-auto overflow-visible"
							/>
						)}
					</div>
				) : (
					<EmptyFactoryState
						title="No Build-vs-Compose Matrix yet"
						body="Build-vs-Compose Matrices are authored per project as part of landscape research. Construction PM's matrix lands in Phase D via WO-D-CONSTRUCTION-PM-LANDSCAPE-RESEARCH."
						sourcePath="projects/_shared/foundations/landscape-research-policy.md"
						onOpenSource={setSheetSource}
					/>
				)}
			</main>
		</div>
	);

	return (
		<>
			<LDPSurface
				title="Build-vs-Compose Matrix"
				description="Project landscape-research gate: build, build with vendor input, skip, or monitor. Vendor APIs are inputs, never replacements."
				status={status}
				primaryAgent={BUILD_COMPOSE_AGENT}
				turns={ldp.turns}
				readPane={readPane}
				inputValue={ldp.inputValue}
				inputPlaceholder="Ask LANDSCAPE_ANALYST about vendor inputs, build decisions, risk, or positioning impact..."
				isThinking={ldp.isThinking}
				thinkingLabel={ldp.thinkingLabel}
				onInputChange={ldp.setInputValue}
				onSubmit={ldp.submit}
			/>
			<DocumentSheet
				path={sheetSource}
				title="Build-vs-compose source"
				onOpenChange={(open) => !open && setSheetSource(null)}
			/>
			{ldp.streamElement}
		</>
	);
}
