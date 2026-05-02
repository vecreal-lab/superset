import { Badge } from "@superset/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useActiveProjectId } from "renderer/stores/active-project";
import {
	DocumentSheet,
	FactorySearch,
	SourceButton,
	StatusBadge,
	WorkOrderLink,
	formatDate,
	rowMatchesProject,
	type FactoryRow,
} from "../components/FactoryView";
import {
	LDPSurface,
	useLDPSurfaceDialogue,
	type LDPDialogueAgent,
	type LDPStatusSummary,
} from "../components/LDPSurface";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/work-orders/",
)({
	validateSearch: (search) => ({
		dialogueId:
			typeof search.dialogueId === "string" ? search.dialogueId : undefined,
	}),
	component: WorkOrdersPage,
});

const WORK_ORDERS_AGENT: LDPDialogueAgent = {
	name: "ORCH",
	roleId: "ORCH",
	description:
		"Primary Work Orders LDP steward. PRODUCT_SCOPE is attributed on scope impact.",
};

function dataText(row: FactoryRow, key: string, fallback = "unknown"): string {
	const value = row.data[key];
	return typeof value === "string" && value ? value : fallback;
}

function gateClass(gateState: string): string | undefined {
	if (gateState === "shipped") return "text-emerald-600 dark:text-emerald-400";
	if (gateState === "Yuriy gate required") {
		return "text-amber-600 dark:text-amber-400";
	}
	return undefined;
}

function latestModified(rows: FactoryRow[]): string | undefined {
	return rows
		.map((row) => row.modified_at)
		.filter((value): value is string => Boolean(value))
		.sort()
		.at(-1);
}

function WorkOrdersPage() {
	const [query, setQuery] = useState("");
	const [selectedSource, setSelectedSource] = useState<string | null>(null);
	const activeProjectId = useActiveProjectId();
	const search = Route.useSearch();
	const navigate = useNavigate();
	const workOrders = electronTrpc.factory.dataset.useQuery(
		{ dataset: "work_orders" },
		{ refetchInterval: 5000 },
	);
	const ldp = useLDPSurfaceDialogue({
		project: activeProjectId,
		surface: "work-orders",
		title: "Work Orders dialogue",
		initialDialogueId: search.dialogueId,
		onDialogueIdChange: (dialogueId) =>
			navigate({
				to: "/factory/work-orders",
				search: { dialogueId },
				replace: true,
			}),
	});
	const rows = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return (workOrders.data || [])
			.filter((row: FactoryRow) => rowMatchesProject(row, activeProjectId))
			.filter((row: FactoryRow) =>
				needle
					? `${row.id} ${row.title} ${row.status} ${row.source_relative_path}`
							.toLowerCase()
							.includes(needle)
					: true,
			);
	}, [activeProjectId, query, workOrders.data]);
	const allProjectRows = useMemo(
		() =>
			(workOrders.data || []).filter((row: FactoryRow) =>
				rowMatchesProject(row, activeProjectId),
			),
		[activeProjectId, workOrders.data],
	);
	const gateRequired = allProjectRows.filter(
		(row) => dataText(row, "gate_state") === "Yuriy gate required",
	).length;
	const auditOnly = allProjectRows.filter(
		(row) => dataText(row, "gate_state") === "AUDIT-only",
	).length;
	const shipped = allProjectRows.filter(
		(row) => dataText(row, "gate_state") === "shipped",
	).length;
	const status: LDPStatusSummary = {
		kind: "read_model",
		label: "Work Orders",
		state: ldp.state,
		sourcePath: "work-orders/",
		lastUpdated: formatDate(latestModified(allProjectRows)),
		primaryAgent: WORK_ORDERS_AGENT.roleId,
		metrics: [
			{ label: "Visible work orders", value: rows.length },
			{
				label: "Yuriy gates",
				value: gateRequired,
				tone: gateRequired > 0 ? "warning" : "success",
			},
			{ label: "AUDIT-only", value: auditOnly },
			{ label: "Shipped", value: shipped, tone: shipped > 0 ? "success" : "default" },
		],
		flags: [
			{ label: `Active project: ${activeProjectId}` },
			{ label: "PRODUCT_SCOPE on scope", tone: "default" },
		],
	};

	const readPane = (
		<div className="space-y-4">
			<div className="max-w-sm">
				<FactorySearch
					value={query}
					placeholder="Search work orders"
					onChange={setQuery}
				/>
			</div>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>ID</TableHead>
						<TableHead>Title</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Variant</TableHead>
						<TableHead>Gate state</TableHead>
						<TableHead>Source</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row: FactoryRow) => {
						const gateState = dataText(row, "gate_state");
						return (
							<TableRow key={row.source_relative_path}>
								<TableCell>
									<WorkOrderLink id={row.id} />
								</TableCell>
								<TableCell className="max-w-xl whitespace-normal">
									{row.title}
								</TableCell>
								<TableCell>
									<StatusBadge status={row.status} />
								</TableCell>
								<TableCell className="font-mono text-xs">
									{row.data.pipeline_variant || "unknown"}
								</TableCell>
								<TableCell>
									<Badge variant="outline" className={gateClass(gateState)}>
										{gateState}
									</Badge>
								</TableCell>
								<TableCell className="max-w-sm">
									<SourceButton
										path={row.source_relative_path}
										onOpen={setSelectedSource}
									/>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);

	return (
		<>
			<LDPSurface
				title="Work Orders"
				description="Canonical work-order queue for the active project, with gate state, source traceability, and drilldown into runs, evidence, approvals, and attachments."
				status={status}
				primaryAgent={WORK_ORDERS_AGENT}
				turns={ldp.turns}
				readPane={readPane}
				inputValue={ldp.inputValue}
				inputPlaceholder="Ask ORCH about queue priority, scope, gates, or a work-order change..."
				isThinking={ldp.isThinking}
				thinkingLabel={ldp.thinkingLabel}
				onInputChange={ldp.setInputValue}
				onSubmit={ldp.submit}
			/>
			<DocumentSheet
				path={selectedSource}
				title="Work-order source"
				onOpenChange={(open) => !open && setSelectedSource(null)}
			/>
			{ldp.streamElement}
		</>
	);
}
