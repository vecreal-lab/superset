import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
	AttentionPill,
	Card,
	PipelineStrip,
	ReferenceTree,
	StatusBadge,
	type PipelineStage,
	type ReferenceTreeNode,
} from "renderer/components/vecreal";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	FactoryPage,
	FactorySection,
	formatDate,
	type FactoryRow,
} from "./components/FactoryView";

export const Route = createFileRoute("/_authenticated/_dashboard/factory/")({
	component: MissionCanvasPage,
});

const PROJECTS = [
	{
		id: "software-factory",
		label: "Software Factory",
		kind: "factory infrastructure",
	},
	{ id: "vecreal", label: "Vecreal", kind: "company brain" },
	{
		id: "construction-pm",
		label: "Construction PM",
		kind: "product track",
		matchers: ["construction-pm", "vecreal/construction-pm"],
	},
	{
		id: "corporate-intelligence",
		label: "Corporate Intelligence",
		kind: "future product track",
		matchers: ["corporate-intelligence", "vecreal/corporate-intelligence"],
	},
];

interface PendingApproval {
	id: string;
	work_order_id: string;
	title: string;
	gate: string;
	run_id: string;
	run_relative_path: string;
}

function rowProject(row: FactoryRow): string {
	const value = row.data.project_id;
	return typeof value === "string" && value ? value : row.source_relative_path;
}

function matchesProject(row: FactoryRow, project: (typeof PROJECTS)[number]) {
	const haystack = rowProject(row);
	const matchers = project.matchers ?? [project.id];
	return matchers.some((matcher) => haystack.includes(matcher));
}

function isOpenStatus(status?: string | null) {
	const value = (status || "").toLowerCase();
	return (
		value.includes("queued") ||
		value.includes("planned") ||
		value.includes("progress") ||
		value.includes("approval") ||
		value.includes("review")
	);
}

function nodeState(status?: string | null): ReferenceTreeNode["state"] {
	const value = (status || "").toLowerCase();
	if (value.includes("complete") || value.includes("closed") || value.includes("approved")) {
		return "satisfied";
	}
	if (value.includes("failed") || value.includes("blocked") || value.includes("revision")) {
		return "broken";
	}
	return "pending";
}

function buildTreeNodes(workOrders: FactoryRow[]): ReferenceTreeNode[] {
	const active = workOrders
		.filter((row) => isOpenStatus(row.status))
		.slice(0, 12)
		.map((row) => ({
			id: row.id,
			label: row.id,
			state: nodeState(row.status),
		}));
	const recent = workOrders
		.filter((row) => !isOpenStatus(row.status))
		.slice(0, 8)
		.map((row) => ({
			id: `recent-${row.id}`,
			label: row.id,
			state: nodeState(row.status),
		}));

	return [
		{
			id: "active-cohort",
			label: "Open / active work-order cohort",
			state: active.length ? "pending" : "satisfied",
			children: active,
		},
		{
			id: "recent-cohort",
			label: "Recently landed work",
			state: "satisfied",
			children: recent,
		},
	];
}

function activeRunStages(workOrders: FactoryRow[]): PipelineStage[] {
	const open = workOrders.filter((row) => isOpenStatus(row.status)).slice(0, 5);
	if (!open.length) {
		return [{ id: "idle", label: "No active cockpit runs", state: "empty" }];
	}
	return open.map((row) => ({
		id: row.id,
		label: row.id,
		state: (row.status || "").toLowerCase().includes("approval")
			? "active"
			: "pending",
	}));
}

function activityRows(
	runs: FactoryRow[],
	lessons: FactoryRow[],
	approvals: PendingApproval[],
) {
	return [
		...runs.slice(0, 6).map((row) => ({
			id: `run-${row.id}`,
			title: row.title,
			meta: row.source_relative_path,
			when: row.modified_at,
			status: row.status || "run",
		})),
		...lessons.slice(0, 3).map((row) => ({
			id: `lesson-${row.id}`,
			title: row.title,
			meta: row.source_relative_path,
			when: row.modified_at,
			status: "lesson",
		})),
		...approvals.slice(0, 3).map((approval) => ({
			id: `approval-${approval.id}`,
			title: `${approval.work_order_id} awaiting ${approval.gate}`,
			meta: approval.run_relative_path,
			when: null,
			status: "approval",
		})),
	].slice(0, 8);
}

function MissionCanvasPage() {
	const workOrdersQuery = electronTrpc.factory.dataset.useQuery(
		{ dataset: "work_orders" },
		{ refetchInterval: 5000 },
	);
	const runsQuery = electronTrpc.factory.dataset.useQuery(
		{ dataset: "runs" },
		{ refetchInterval: 5000 },
	);
	const lessonsQuery = electronTrpc.factory.dataset.useQuery(
		{ dataset: "lessons" },
		{ refetchInterval: 15000 },
	);
	const approvalsQuery = electronTrpc.factory.pendingApprovals.useQuery(undefined, {
		refetchInterval: 5000,
	});

	const workOrders = workOrdersQuery.data ?? [];
	const runs = runsQuery.data ?? [];
	const lessons = lessonsQuery.data ?? [];
	const approvals = (approvalsQuery.data ?? []) as PendingApproval[];
	const treeNodes = useMemo(() => buildTreeNodes(workOrders), [workOrders]);
	const recentActivity = useMemo(
		() => activityRows(runs, lessons, approvals),
		[runs, lessons, approvals],
	);
	const activeStages = useMemo(() => activeRunStages(workOrders), [workOrders]);

	return (
		<FactoryPage
			title="Mission Canvas"
			description="Cross-project mission-control visual layer for factory state, build dependencies, active runs, gates, and recent movement."
		>
			<div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-6">
				<div className="grid min-w-0 gap-4">
					<div className="grid min-w-0 gap-4">
						<FactorySection
							title="Project status"
							description="Factory and product tracks visible from one operator surface."
						>
							<div className="grid gap-3 md:grid-cols-2">
								{PROJECTS.map((project) => {
									const projectRows = workOrders.filter((row) =>
										matchesProject(row, project),
									);
									const openCount = projectRows.filter((row) =>
										isOpenStatus(row.status),
									).length;
									return (
										<Card key={project.id} variant="compact">
											<div className="flex items-start justify-between gap-3">
												<div className="min-w-0">
													<h3 className="m-0 truncate text-sm font-medium">
														{project.label}
													</h3>
													<p className="m-0 mt-1 text-xs text-muted-foreground">
														{project.kind}
													</p>
												</div>
												<StatusBadge
													variant={openCount ? "warning" : "neutral"}
													size="sm"
												>
													{openCount ? `${openCount} open` : "quiet"}
												</StatusBadge>
											</div>
										</Card>
									);
								})}
							</div>
						</FactorySection>

						<FactorySection
							title="Cross-project Build Tree"
							description="Open work-order cohort and recently landed work. Detailed dependency evolution is a follow-up Cofounder enhancement."
						>
							<ReferenceTree nodes={treeNodes} label="Cross-project Build Tree" />
						</FactorySection>
					</div>

					<div className="grid min-w-0 content-start gap-4">
						<FactorySection
							title="Operator priority"
							description="Pending gates and escalations that need attention."
						>
							<div className="grid gap-3">
								<AttentionPill
									count={approvals.length}
									variant={approvals.length ? "attention" : "info"}
									isLive={approvals.length > 0}
								>
									{approvals.length ? "Pending gates" : "No pending gates"}
								</AttentionPill>
								<Link
									to="/factory/approval-queue"
									search={{ dialogueId: undefined }}
									className="text-sm text-primary underline-offset-4 hover:underline"
								>
									Open approval queue
								</Link>
							</div>
						</FactorySection>

						<FactorySection
							title="Active runs"
							description="Compact run-state strip for currently open work."
						>
							<PipelineStrip
								stages={activeStages}
								variant="rail"
								ariaLabel="Active run state"
							/>
						</FactorySection>

						<FactorySection
							title="Recent activity"
							description="Runs, approvals, and lessons surfaced in the latest read-model refresh."
						>
							<div className="grid gap-2">
								{recentActivity.length ? (
									recentActivity.map((item) => (
										<Card key={item.id} variant="compact">
											<div className="flex items-start justify-between gap-3">
												<div className="min-w-0">
													<h3 className="m-0 truncate text-sm font-medium">
														{item.title}
													</h3>
													<p className="m-0 mt-1 truncate font-mono text-[10px] text-muted-foreground">
														{item.meta}
													</p>
													{item.when ? (
														<p className="m-0 mt-1 text-xs text-muted-foreground">
															{formatDate(item.when)}
														</p>
													) : null}
												</div>
												<StatusBadge variant="neutral" size="sm">
													{item.status}
												</StatusBadge>
											</div>
										</Card>
									))
								) : (
									<p className="text-sm text-muted-foreground">
										No recent read-model activity is available yet.
									</p>
								)}
							</div>
						</FactorySection>
					</div>
				</div>
			</div>
		</FactoryPage>
	);
}
