import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
	AlertTriangle,
	Clock3,
	Filter,
	GitBranch,
	Layers3,
	Play,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
	AuthorChip,
	Button,
	Card,
	Chip,
	FilterSortDrawer,
	LoadingState,
	StatusBadge,
	type StatusBadgeVariant,
} from "renderer/components/vecreal";
import {
	DependencyEdge,
	DialogueAttentionBadge,
} from "renderer/components/factory-primitives";
import { electronTrpc, type ElectronRouterOutputs } from "renderer/lib/electron-trpc";
import { useFactoryWorkspaceStore } from "lib/stores/workspace";
import { useActiveProjectId } from "renderer/stores/active-project";
import {
	DocumentSheet,
	FactorySearch,
	SourceButton,
	WorkOrderLink,
	formatDate,
} from "../components/FactoryView";
import {
	LDPSurface,
	useLDPSurfaceDialogue,
	type LDPDialogueAgent,
	type LDPStatusSummary,
} from "../components/LDPSurface";
import { WorkOrderComposer } from "./components/WorkOrderComposer";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/work-orders/",
)({
	validateSearch: (search) => ({
		dialogueId:
			typeof search.dialogueId === "string" ? search.dialogueId : undefined,
	}),
	component: WorkOrdersPage,
});

type WorkOrdersList = ElectronRouterOutputs["factory"]["workOrders"]["list"];
type WorkOrderItem = WorkOrdersList["sections"]["queued"][number];
type ScopeFilter = WorkOrdersList["filters"]["scope"];
type StateFilter = WorkOrdersList["filters"]["state"];

const WORK_ORDERS_AGENT: LDPDialogueAgent = {
	name: "ORCH",
	roleId: "ORCH",
	description:
		"Primary Work Orders LDP steward. PRODUCT_SCOPE is attributed on scope impact.",
};

function statusVariant(state: WorkOrderItem["state"]): StatusBadgeVariant {
	if (state === "completed") return "success";
	if (state === "blocked" || state === "failed" || state === "canceled") {
		return "error";
	}
	if (state === "awaiting_approval") return "warning";
	if (state === "running") return "info";
	return "neutral";
}

function labelFor(value: string): string {
	return value
		.split(/[_-]+/g)
		.map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
		.join(" ");
}

function formatDuration(ms?: number | null): string {
	if (!ms) return "unknown";
	const minutes = Math.max(1, Math.round(ms / 60000));
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	const remainder = minutes % 60;
	return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function FilterSelect({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string;
	options: Array<{ value: string; label: string; count?: number }>;
	onChange: (value: string) => void;
}) {
	return (
		<label className="grid gap-1 text-xs text-muted-foreground">
			<span>{label}</span>
			<select
				value={value}
				className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
				onChange={(event) => onChange(event.target.value)}
			>
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
						{typeof option.count === "number" ? ` (${option.count})` : ""}
					</option>
				))}
			</select>
		</label>
	);
}

function statusBadge(item: WorkOrderItem) {
	return (
		<StatusBadge
			variant={statusVariant(item.state)}
			isLive={item.state === "running"}
			ariaLabel={`Work order state: ${labelFor(item.state)}`}
		>
			{labelFor(item.state)}
		</StatusBadge>
	);
}

function AuthorCluster({ item }: { item: WorkOrderItem }) {
	const showAssigned =
		item.assignedTo.user.toLowerCase() !== item.author.user.toLowerCase();
	return (
		<div className="flex min-w-0 flex-wrap items-center gap-2">
			<AuthorChip
				name={item.author.displayName}
				kind={item.author.isAgent ? "agent" : "human"}
				role={item.author.role}
				showRole={Boolean(item.author.role)}
				maxWidth={160}
			/>
			{showAssigned && (
				<AuthorChip
					name={item.assignedTo.displayName}
					kind={item.assignedTo.isAgent ? "agent" : "human"}
					role="assigned"
					showRole
					maxWidth={160}
				/>
			)}
		</div>
	);
}

function DependencySummary({ item }: { item: WorkOrderItem }) {
	if (!item.dependencyEdges.length) {
		return <span className="text-xs text-muted-foreground">No blockers</span>;
	}
	return (
		<div className="grid max-w-sm gap-2">
			{item.dependencyEdges.slice(0, 2).map((edge) => (
				<DependencyEdge key={`${edge.from}-${edge.to}`} edge={edge} />
			))}
			{item.dependencyEdges.length > 2 && (
				<span className="text-xs text-muted-foreground">
					+{item.dependencyEdges.length - 2} more
				</span>
			)}
		</div>
	);
}

function ProgressMeter({ item }: { item: WorkOrderItem }) {
	if (!item.progress) return null;
	const total = Math.max(1, item.progress.totalStages);
	const current = Math.min(total, item.progress.currentStageIndex + 1);
	const percent = Math.max(8, Math.round((current / total) * 100));
	return (
		<div className="grid min-w-52 gap-2">
			<div className="flex items-center justify-between gap-3 text-xs">
				<span className="truncate font-mono text-muted-foreground">
					{item.progress.currentStage}
				</span>
				<span className="whitespace-nowrap text-muted-foreground">
					{current}/{total} / {formatDuration(item.progress.elapsedMs)}
				</span>
			</div>
			<div
				aria-hidden="true"
				className="h-2 overflow-hidden rounded-full bg-[color:var(--bg-soft)]"
			>
				<div
					className="h-full rounded-full bg-[color:var(--clay-light)] transition-[width]"
					style={{ width: `${percent}%` }}
				/>
			</div>
		</div>
	);
}

function SectionShell({
	title,
	description,
	count,
	icon,
	children,
}: {
	title: string;
	description: string;
	count: number;
	icon: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="overflow-hidden rounded-md border">
			<div className="flex items-start justify-between gap-4 border-b px-4 py-3">
				<div className="flex min-w-0 items-start gap-3">
					<span className="mt-0.5 text-muted-foreground">{icon}</span>
					<div className="min-w-0">
						<h2 className="text-sm font-medium">{title}</h2>
						<p className="mt-1 text-xs text-muted-foreground">{description}</p>
					</div>
				</div>
				<Chip tone="neutral" size="sm">
					{count}
				</Chip>
			</div>
			{children}
		</section>
	);
}

function EmptySection({ message }: { message: string }) {
	return <div className="px-4 py-6 text-sm text-muted-foreground">{message}</div>;
}

function InFlightSection({ items }: { items: WorkOrderItem[] }) {
	return (
		<SectionShell
			title="In flight"
			description="Currently running or paused for operator approval."
			count={items.length}
			icon={<Clock3 className="size-4" />}
		>
			{items.length === 0 ? (
				<EmptySection message="No work orders are in flight for this filter." />
			) : (
				<div className="grid gap-3 p-4">
					{items.map((item) => (
						<Card key={item.id} variant="compact">
							<div className="flex flex-wrap items-start justify-between gap-4">
								<div className="min-w-0 space-y-2">
									<div className="flex min-w-0 flex-wrap items-center gap-2">
										<WorkOrderLink id={item.id} />
										{statusBadge(item)}
										<Chip tone="clay" size="sm">
											{labelFor(item.scope)}
										</Chip>
									</div>
									<p className="m-0 max-w-3xl text-sm text-muted-foreground">
										{item.title}
									</p>
									<AuthorCluster item={item} />
								</div>
								<ProgressMeter item={item} />
							</div>
						</Card>
					))}
				</div>
			)}
		</SectionShell>
	);
}

function WorkOrderTable({
	items,
	kind,
	onOpenSource,
	onRun,
}: {
	items: WorkOrderItem[];
	kind: "queued" | "history";
	onOpenSource: (path: string) => void;
	onRun: (item: WorkOrderItem) => void;
}) {
	if (items.length === 0) {
		return (
			<EmptySection
				message={
					kind === "queued"
						? "No queued work orders match this filter."
						: "No history rows match this filter."
				}
			/>
		);
	}
	return (
		<div className="overflow-x-auto">
			<table className="w-full min-w-[60rem] text-left text-sm">
				<thead className="border-b bg-muted/20 text-xs text-muted-foreground">
					<tr>
						<th className="px-4 py-3 font-medium">Work order</th>
						<th className="px-4 py-3 font-medium">State</th>
						<th className="px-4 py-3 font-medium">Scope</th>
						<th className="px-4 py-3 font-medium">Author</th>
						<th className="px-4 py-3 font-medium">Dependencies</th>
						<th className="px-4 py-3 font-medium">Activity</th>
						<th className="px-4 py-3 font-medium">Source</th>
						<th className="px-4 py-3 font-medium">Action</th>
					</tr>
				</thead>
				<tbody>
					{items.map((item) => (
						<tr key={item.sourceRelativePath} className="border-b last:border-b-0">
							<td className="max-w-md px-4 py-3 align-top">
								<div className="space-y-1">
									<WorkOrderLink id={item.id} />
									<p className="m-0 line-clamp-2 text-sm text-muted-foreground">
										{item.title}
									</p>
									{item.dialogueAttentionCount > 0 && (
										<DialogueAttentionBadge
											count={item.dialogueAttentionCount}
											hasMineAttention
										/>
									)}
								</div>
							</td>
							<td className="px-4 py-3 align-top">{statusBadge(item)}</td>
							<td className="px-4 py-3 align-top">
								<Chip tone={item.scope === "brand" ? "clay" : "neutral"} size="sm">
									{labelFor(item.scope)}
								</Chip>
							</td>
							<td className="px-4 py-3 align-top">
								<AuthorCluster item={item} />
							</td>
							<td className="px-4 py-3 align-top">
								<DependencySummary item={item} />
							</td>
							<td className="px-4 py-3 align-top">
								<div className="grid gap-1 text-xs text-muted-foreground">
									<span>{formatDate(item.lastActivityAt)}</span>
									{item.runCount > 0 && <span>{item.runCount} run(s)</span>}
								</div>
							</td>
							<td className="max-w-xs px-4 py-3 align-top">
								<SourceButton path={item.sourceRelativePath} onOpen={onOpenSource} />
							</td>
							<td className="px-4 py-3 align-top">
								{kind === "queued" ? (
									<Button
										size="sm"
										variant={item.canRun ? "secondary" : "ghost"}
										disabled={!item.canRun}
										onClick={() => onRun(item)}
									>
										<Play className="size-3.5" />
										Run
									</Button>
								) : (
									<Button size="sm" variant="ghost" onClick={() => onRun(item)}>
										Open
									</Button>
								)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function WorkOrdersPage() {
	const activeProjectId = useActiveProjectId();
	const workspace = useFactoryWorkspaceStore((state) => state.workspace);
	const search = Route.useSearch();
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const [selectedSource, setSelectedSource] = useState<string | null>(null);
	const [projectFilter, setProjectFilter] = useState<string>(activeProjectId);
	const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
	const [stateFilter, setStateFilter] = useState<StateFilter>("all");
	const [assignedToMe, setAssignedToMe] = useState(false);
	const [historyLimit, setHistoryLimit] = useState(50);
	const runtimeWorkspace = (
		globalThis as typeof globalThis & {
			FactoryWorkspaceContext?: {
				currentOperatorId?: string;
				currentOperatorDisplayName?: string;
			};
		}
	).FactoryWorkspaceContext;
	const currentUser = {
		user:
			runtimeWorkspace?.currentOperatorId ||
			workspace.primaryOwner ||
			"yuriy",
		displayName:
			runtimeWorkspace?.currentOperatorDisplayName ||
			workspace.primaryOwner ||
			"yuriy",
		role: "operator",
	};

	const workOrders = electronTrpc.factory.workOrders.list.useQuery(
		{
			projectId: projectFilter,
			scope: scopeFilter,
			state: stateFilter,
			assignedToMe,
			search: query,
			historyLimit,
		},
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

	const data = workOrders.data;
	const appliedFilters = useMemo(() => {
		const filters: string[] = [];
		if (projectFilter !== "all") filters.push(`Project: ${projectFilter}`);
		if (scopeFilter !== "all") filters.push(`Scope: ${labelFor(scopeFilter)}`);
		if (stateFilter !== "all") filters.push(`State: ${labelFor(stateFilter)}`);
		if (assignedToMe) filters.push("Assigned to me");
		return filters;
	}, [assignedToMe, projectFilter, scopeFilter, stateFilter]);
	const totalVisible =
		(data?.sections.inFlight.length || 0) +
		(data?.sections.queued.length || 0) +
		(data?.sections.historyTotal || 0);
	const status: LDPStatusSummary = {
		kind: "read_model",
		label: "Work Orders",
		state: ldp.state,
		sourcePath: "work-orders/",
		lastUpdated: data ? formatDate(data.generatedAt) : undefined,
		primaryAgent: WORK_ORDERS_AGENT.roleId,
		projectId: projectFilter === "all" ? activeProjectId : projectFilter,
		projectOwner: data?.activeProjectOwner,
		metrics: [
			{ label: "Visible", value: totalVisible },
			{ label: "In flight", value: data?.sections.inFlight.length || 0, tone: data?.sections.inFlight.length ? "warning" : "default" },
			{ label: "Queued", value: data?.sections.queued.length || 0 },
			{ label: "History", value: data?.sections.historyTotal || 0, tone: data?.sections.historyTotal ? "success" : "default" },
		],
		flags: [
			{ label: "Three-axis filter: project / scope / state" },
			{ label: "Assigned-to seam is v0 no-op" },
		],
	};

	const navigateToDetail = (item: WorkOrderItem) =>
		navigate({
			to: "/factory/work-orders/$workOrderId",
			params: { workOrderId: item.id },
			search: { dialogueId: undefined },
		});

	const filterPane = (
		<div className="grid gap-4 rounded-md border bg-muted/10 p-4">
			<div className="grid gap-3 xl:grid-cols-[minmax(16rem,1fr)_auto]">
				<FactorySearch
					value={query}
					placeholder="Search ID, title, owner, state, or source"
					onChange={setQuery}
				/>
				<div className="flex flex-wrap items-center gap-2">
					<WorkOrderComposer
						defaultProjectId={activeProjectId}
						projectOptions={data?.projectOptions || []}
						currentUser={currentUser}
						onSaved={(result) => {
							const first = result.saved[0]?.id;
							if (!first) return;
							void navigate({
								to: "/factory/work-orders/$workOrderId",
								params: { workOrderId: first },
								search: { dialogueId: undefined },
							});
						}}
					/>
					<FilterSortDrawer
						triggerLabel="Filters"
						appliedFilters={appliedFilters}
					>
						<div className="grid gap-4">
							<FilterSelect
								label="Project"
								value={projectFilter}
								options={[
									{ value: "all", label: "All projects" },
									...(data?.projectOptions || []),
								]}
								onChange={setProjectFilter}
							/>
							<FilterSelect
								label="Scope"
								value={scopeFilter}
								options={[
									{ value: "all", label: "All scopes" },
									...(data?.scopeOptions || []),
								]}
								onChange={(value) => setScopeFilter(value as ScopeFilter)}
							/>
							<FilterSelect
								label="State"
								value={stateFilter}
								options={[
									{ value: "all", label: "All states" },
									...(data?.stateOptions || []),
								]}
								onChange={(value) => setStateFilter(value as StateFilter)}
							/>
							<label className="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={assignedToMe}
									onChange={(event) => setAssignedToMe(event.target.checked)}
								/>
								<span>Assigned to me</span>
								<span className="text-xs text-muted-foreground">
									v0 single-operator seam
								</span>
							</label>
							<Button
								size="sm"
								variant="ghost"
								onClick={() => {
									setProjectFilter(activeProjectId);
									setScopeFilter("all");
									setStateFilter("all");
									setAssignedToMe(false);
									setQuery("");
								}}
							>
								Reset
							</Button>
						</div>
					</FilterSortDrawer>
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				<Filter className="size-3.5" />
				{appliedFilters.length ? (
					appliedFilters.map((filter) => (
						<Chip key={filter} tone="clay" size="xs">
							{filter}
						</Chip>
					))
				) : (
					<span>No extra filters applied.</span>
				)}
			</div>
		</div>
	);

	const readPane = (
		<div className="space-y-4">
			{filterPane}
			{workOrders.isLoading ? (
				<LoadingState label="Building work-order sections" variant="panel" />
			) : workOrders.isError ? (
				<div className="rounded-md border border-destructive/40 p-4 text-sm text-destructive">
					{workOrders.error.message}
				</div>
			) : data ? (
				<>
					<InFlightSection items={data.sections.inFlight} />
					<SectionShell
						title="Queued"
						description="Ready, queued, and blocked work orders. Run opens the detail/run surface."
						count={data.sections.queued.length}
						icon={<GitBranch className="size-4" />}
					>
						<WorkOrderTable
							items={data.sections.queued}
							kind="queued"
							onOpenSource={setSelectedSource}
							onRun={navigateToDetail}
						/>
					</SectionShell>
					<SectionShell
						title="History"
						description="Terminal runs sorted by most recent activity."
						count={data.sections.historyTotal}
						icon={<Layers3 className="size-4" />}
					>
						<WorkOrderTable
							items={data.sections.history}
							kind="history"
							onOpenSource={setSelectedSource}
							onRun={navigateToDetail}
						/>
						{data.sections.historyHasMore && (
							<div className="border-t px-4 py-3">
								<Button
									size="sm"
									variant="secondary"
									onClick={() => setHistoryLimit((value) => value + 50)}
								>
									Load more history
								</Button>
							</div>
						)}
					</SectionShell>
					{data.dependencyGraph.blockedQueue.length > 0 && (
						<div className="flex items-start gap-2 rounded-md border border-[color:var(--warning-light)] bg-[color:var(--bg-soft)] p-3 text-sm">
							<AlertTriangle className="mt-0.5 size-4 text-[color:var(--warning-light)]" />
							<div>
								<div className="font-medium">Blocked queue</div>
								<p className="m-0 mt-1 text-muted-foreground">
									{data.dependencyGraph.blockedQueue.join(", ")}
								</p>
							</div>
						</div>
					)}
				</>
			) : null}
		</div>
	);

	return (
		<>
			<LDPSurface
				title="Work Orders"
				description="Canonical work-order queue for the active project, organized by in-flight work, queued work, and history with project, scope, and state filters."
				status={status}
				primaryAgent={WORK_ORDERS_AGENT}
				turns={ldp.turns}
				readPane={readPane}
				inputValue={ldp.inputValue}
				inputPlaceholder="Ask ORCH about queue priority, blockers, owners, or a work-order change..."
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
