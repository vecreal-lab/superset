import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	Activity,
	AlertTriangle,
	FileText,
	RefreshCw,
	UserRound,
} from "lucide-react";
import type {
	ActiveProjectTreeNode,
	ActiveRunNode,
	ActiveRunsSnapshot,
	ActiveRunStageNode,
	ActiveRunStageNodeState,
} from "main/lib/factory-work-orders";
import {
	AuthorChip,
	Card,
	DateTimeText,
	ReferenceTree,
	StatusBadge,
	type ReferenceTreeNode,
	type StatusBadgeVariant,
} from "renderer/components/vecreal";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useActiveProjectId } from "renderer/stores/active-project";

const shellStyle: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: "var(--sp-8)",
	minWidth: 0,
	maxWidth: "100%",
	minHeight: "100%",
	padding: "var(--sp-8)",
	border: "var(--factory-border-width) solid var(--border)",
	borderRadius: "var(--r-6)",
	background: "var(--bg-card)",
	color: "var(--text-primary)",
	fontFamily: "var(--font-ui)",
};

const headerStyle: CSSProperties = {
	display: "flex",
	alignItems: "flex-start",
	justifyContent: "space-between",
	gap: "var(--sp-6)",
	flexWrap: "wrap",
	minWidth: 0,
};

const eyebrowStyle: CSSProperties = {
	margin: 0,
	color: "var(--text-tertiary)",
	fontSize: "var(--sp-6)",
	lineHeight: 1.4,
};

const titleStyle: CSSProperties = {
	margin: 0,
	fontSize: "var(--sp-9)",
	lineHeight: 1.25,
	letterSpacing: 0,
};

const toolbarStyle: CSSProperties = {
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	gap: "var(--sp-5)",
	flexWrap: "wrap",
	minWidth: 0,
};

const toggleStyle: CSSProperties = {
	display: "inline-flex",
	alignItems: "center",
	gap: "var(--sp-3)",
	minHeight: "var(--sp-10)",
	paddingInline: "var(--sp-4)",
	border: "var(--factory-border-width) solid var(--border)",
	borderRadius: "var(--r-3)",
	background: "var(--bg-soft)",
	color: "var(--text-body)",
	fontSize: "var(--sp-6)",
	lineHeight: 1,
};

const runListStyle: CSSProperties = {
	display: "grid",
	gap: "var(--sp-7)",
	minWidth: 0,
	maxWidth: "100%",
};

const stageRailStyle: CSSProperties = {
	display: "grid",
	gridAutoFlow: "column",
	gridAutoColumns: "minmax(9rem, 1fr)",
	gap: "var(--sp-5)",
	width: "100%",
	minWidth: 0,
	maxWidth: "100%",
	overflowX: "auto",
	paddingBlock: "var(--sp-2)",
};

const inlinePanelStyle: CSSProperties = {
	display: "grid",
	gap: "var(--sp-4)",
	minWidth: 0,
	maxWidth: "100%",
	padding: "var(--sp-6)",
	border: "var(--factory-border-width) solid var(--border)",
	borderRadius: "var(--r-4)",
	background: "var(--bg-soft)",
};

const preStyle: CSSProperties = {
	margin: 0,
	maxWidth: "100%",
	maxHeight: "18rem",
	overflow: "auto",
	whiteSpace: "pre-wrap",
	fontFamily: "var(--font-mono)",
	fontSize: "var(--sp-6)",
	lineHeight: 1.5,
	color: "var(--text-body)",
};

function HomeTreeMotionStyles() {
	return (
		<style>
			{`
				@keyframes home-tree-current-pulse {
					0%, 100% { box-shadow: var(--focus-ring-soft); }
					50% { box-shadow: var(--focus-ring); }
				}
				@media (prefers-reduced-motion: reduce) {
					[data-home-tree-stage="current"] {
						animation: none !important;
					}
				}
			`}
		</style>
	);
}

function stateBadgeVariant(state: ActiveRunStageNodeState): StatusBadgeVariant {
	if (state === "completed") return "success";
	if (state === "failed") return "error";
	if (state === "gated") return "warning";
	if (state === "current") return "info";
	return "neutral";
}

function runBadgeVariant(state: ActiveRunNode["state"]): StatusBadgeVariant {
	if (state === "running") return "info";
	if (state === "awaiting_approval") return "warning";
	if (state === "failed") return "error";
	return "neutral";
}

function borderForState(state: ActiveRunStageNodeState): string {
	if (state === "completed") return "var(--success)";
	if (state === "current") return "var(--clay-bright)";
	if (state === "failed") return "var(--error)";
	if (state === "gated") return "var(--warning)";
	return "var(--border)";
}

function edgeColorForState(state: ActiveRunStageNodeState): string {
	if (state === "failed") return "var(--error)";
	if (state === "gated") return "var(--warning)";
	if (state === "completed") return "var(--success)";
	if (state === "current") return "var(--clay-light)";
	return "var(--border)";
}

function formatState(value: string): string {
	return value.replace(/[_-]+/g, " ");
}

function quickInfo(run: ActiveRunNode, stage: ActiveRunStageNode): string {
	const parts = [
		`${run.workOrderId}: ${stage.label}`,
		`State: ${formatState(stage.state)}`,
		`Role: ${stage.role}`,
		stage.summary ? `Summary: ${stage.summary}` : null,
		stage.outputPath ? `Output: ${stage.outputPath}` : null,
	].filter(Boolean);
	return parts.join("\n");
}

function hierarchyState(status: string): ReferenceTreeNode["state"] {
	if (status === "active") return "satisfied";
	if (status === "archived" || status === "sunset") return "broken";
	return "pending";
}

function projectHierarchyNodes(nodes: ActiveProjectTreeNode[]): ReferenceTreeNode[] {
	const byParent = new Map<string | null, ActiveProjectTreeNode[]>();
	for (const node of nodes) {
		const key = node.parentId || null;
		const siblings = byParent.get(key) || [];
		siblings.push(node);
		byParent.set(key, siblings);
	}
	const build = (parentId: string | null): ReferenceTreeNode[] =>
		(byParent.get(parentId) || [])
			.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
			.map((node) => ({
				id: node.id,
				label: node.label,
				state: hierarchyState(node.status),
				children: build(node.id),
			}));
	return build(null);
}

function selectedOutputPath(stage: ActiveRunStageNode | null): string | null {
	if (!stage) return null;
	return stage.outputPath || stage.receiptPath || stage.promptPath;
}

function StageNode({
	run,
	stage,
	selected,
	onSelect,
}: {
	run: ActiveRunNode;
	stage: ActiveRunStageNode;
	selected: boolean;
	onSelect: (run: ActiveRunNode, stage: ActiveRunStageNode) => void;
}) {
	const style: CSSProperties = {
		display: "grid",
		gap: "var(--sp-3)",
		width: "100%",
		minHeight: "6.75rem",
		padding: "var(--sp-5)",
		border: "var(--factory-border-width) solid",
		borderColor: selected ? "var(--border-strong)" : borderForState(stage.state),
		borderRadius: "var(--r-5)",
		background: "var(--bg-card)",
		color: "var(--text-primary)",
		textAlign: "left",
		cursor: "pointer",
		transition:
			"border-color var(--motion-fast) var(--ease-out), box-shadow var(--motion-fast) var(--ease-out)",
		animation:
			stage.state === "current"
				? "home-tree-current-pulse var(--motion-slow) var(--ease-in-out) infinite"
				: undefined,
	};

	return (
		<button
			type="button"
			style={style}
			title={quickInfo(run, stage)}
			aria-label={quickInfo(run, stage)}
			data-home-tree-stage={stage.state}
			onClick={() => onSelect(run, stage)}
		>
			<span
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "var(--sp-4)",
					minWidth: 0,
				}}
			>
				<strong
					style={{
						minWidth: 0,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
						fontSize: "var(--sp-7)",
						lineHeight: 1.25,
					}}
				>
					{stage.label}
				</strong>
				<StatusBadge variant={stateBadgeVariant(stage.state)} size="sm" isLive={stage.state === "current"}>
					{formatState(stage.state)}
				</StatusBadge>
			</span>
			<span
				style={{
					color: "var(--text-tertiary)",
					fontFamily: "var(--font-mono)",
					fontSize: "var(--sp-5)",
					lineHeight: 1.4,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap",
				}}
			>
				{stage.role}
			</span>
			<span
				style={{
					color: "var(--text-body)",
					fontSize: "var(--sp-6)",
					lineHeight: 1.35,
					minHeight: "2.6em",
					overflow: "hidden",
				}}
			>
				{stage.summary || selectedOutputPath(stage) || "Awaiting stage output"}
			</span>
		</button>
	);
}

function RunGroup({
	run,
	selectedRunId,
	selectedStage,
	onSelect,
}: {
	run: ActiveRunNode;
	selectedRunId: string | null;
	selectedStage: ActiveRunStageNode | null;
	onSelect: (run: ActiveRunNode, stage: ActiveRunStageNode) => void;
}) {
	const selectedPath = selectedRunId === run.id ? selectedOutputPath(selectedStage) : null;
	const output = electronTrpc.factory.document.useQuery(
		{ path: selectedPath || run.runRelativePath, maxBytes: 30_000 },
		{ enabled: Boolean(selectedPath) },
	);

	return (
		<Card variant="compact" style={{ minWidth: 0, maxWidth: "100%" }}>
			<div style={headerStyle}>
				<div style={{ display: "grid", gap: "var(--sp-3)", minWidth: 0 }}>
					<div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap" }}>
						<StatusBadge variant={runBadgeVariant(run.state)} size="sm" isLive={run.state === "running"}>
							{formatState(run.state)}
						</StatusBadge>
						{run.pipelineVariant ? (
							<StatusBadge variant="neutral" size="sm">
								{run.pipelineVariant}
							</StatusBadge>
						) : null}
					</div>
					<h3
						style={{
							margin: 0,
							fontSize: "var(--sp-8)",
							lineHeight: 1.25,
							letterSpacing: 0,
						}}
					>
						{run.workOrderId}
					</h3>
					<p style={{ margin: 0, color: "var(--text-body)", fontSize: "var(--sp-7)", lineHeight: 1.45 }}>
						{run.title}
					</p>
				</div>
				<div style={{ display: "grid", justifyItems: "end", gap: "var(--sp-3)", minWidth: 0 }}>
					<AuthorChip name={run.triggeredBy.displayName} kind={run.triggeredBy.isAgent ? "agent" : "human"} role="initiated" showRole />
					<AuthorChip name={run.executedBy.displayName} kind={run.executedBy.isAgent ? "agent" : "human"} role="executing" showRole />
					{run.lastActivityAt ? <DateTimeText value={run.lastActivityAt} mode="relative" state="default" /> : null}
				</div>
			</div>

			{run.staleStateNotice ? (
				<div style={inlinePanelStyle} role="status" aria-live="polite">
					<div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
						<AlertTriangle aria-hidden="true" size={16} />
						<strong>Stale-state notice</strong>
					</div>
					<p style={{ margin: 0, color: "var(--text-body)", fontSize: "var(--sp-6)", lineHeight: 1.45 }}>
						{run.staleStateNotice.changeSummary}
					</p>
				</div>
			) : null}

			<ol aria-label={`${run.workOrderId} pipeline stages`} style={stageRailStyle}>
				{run.stages.map((stage, index) => (
					<li
						key={stage.id}
						style={{
							position: "relative",
							display: "grid",
							gap: "var(--sp-4)",
							listStyle: "none",
							minWidth: 0,
						}}
					>
						<StageNode
							run={run}
							stage={stage}
							selected={selectedRunId === run.id && selectedStage?.id === stage.id}
							onSelect={onSelect}
						/>
						{index < run.stages.length - 1 ? (
							<span
								aria-hidden="true"
								style={{
									position: "absolute",
									top: "3.35rem",
									left: "calc(100% + var(--sp-1))",
									width: "var(--sp-5)",
									borderTop: "var(--factory-border-width) solid",
									borderColor: edgeColorForState(stage.state),
								}}
							/>
						) : null}
					</li>
				))}
			</ol>

			{selectedRunId === run.id && selectedStage ? (
				<div style={inlinePanelStyle}>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-4)", flexWrap: "wrap" }}>
						<div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", minWidth: 0 }}>
							<FileText aria-hidden="true" size={16} />
							<strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
								{selectedStage.label} output
							</strong>
						</div>
						{selectedPath ? (
							<StatusBadge variant="neutral" size="sm">
								<span style={{ maxWidth: "min(100%, 22rem)", overflow: "hidden", textOverflow: "ellipsis" }}>
									{selectedPath}
								</span>
							</StatusBadge>
						) : (
							<StatusBadge variant="warning" size="sm">
								no file yet
							</StatusBadge>
						)}
					</div>
					{selectedPath ? (
						output.isLoading ? (
							<p style={{ margin: 0, color: "var(--text-body)", fontSize: "var(--sp-6)" }}>
								Loading output...
							</p>
						) : output.data?.content ? (
							<pre style={preStyle}>{output.data.content}</pre>
						) : (
							<p style={{ margin: 0, color: "var(--text-body)", fontSize: "var(--sp-6)" }}>
								Output path is present, but the file is not readable yet.
							</p>
						)
					) : (
						<p style={{ margin: 0, color: "var(--text-body)", fontSize: "var(--sp-6)", lineHeight: 1.45 }}>
							{selectedStage.summary || "This stage has not produced a persisted output file yet."}
						</p>
					)}
				</div>
			) : null}
		</Card>
	);
}

export function HomeTreeNodeDiagram() {
	const activeProjectId = useActiveProjectId();
	const [showMineOnly, setShowMineOnly] = useState(false);
	const [liveSnapshot, setLiveSnapshot] = useState<ActiveRunsSnapshot | null>(null);
	const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
	const [selectedStage, setSelectedStage] = useState<ActiveRunStageNode | null>(null);
	const input = useMemo(
		() => ({ projectId: activeProjectId, assignedToMe: showMineOnly }),
		[activeProjectId, showMineOnly],
	);
	const snapshot = electronTrpc.factory.workOrders.activeRuns.useQuery(input);

	useEffect(() => {
		if (snapshot.data) setLiveSnapshot(snapshot.data);
	}, [snapshot.data]);

	const handleStreamData = useCallback((event: { snapshot: ActiveRunsSnapshot }) => {
		setLiveSnapshot(event.snapshot);
	}, []);

	electronTrpc.factory.workOrders.activeRunsStream.useSubscription(input, {
		onData: handleStreamData,
	});

	const data = liveSnapshot || snapshot.data;
	const hierarchyNodes = useMemo(
		() => projectHierarchyNodes(data?.projectTree || []),
		[data?.projectTree],
	);
	const staleCount = data?.runs.filter((run) => run.staleStateNotice).length || 0;

	const handleSelect = useCallback((run: ActiveRunNode, stage: ActiveRunStageNode) => {
		setSelectedRunId(run.id);
		setSelectedStage(stage);
	}, []);

	return (
		<section style={shellStyle} aria-label="Active run tree node diagram">
			<HomeTreeMotionStyles />
			<div style={headerStyle}>
				<div style={{ display: "grid", gap: "var(--sp-2)", minWidth: 0 }}>
					<p style={eyebrowStyle}>Factory home</p>
					<h2 style={titleStyle}>Active run map</h2>
					<p style={{ margin: 0, color: "var(--text-body)", fontSize: "var(--sp-7)", lineHeight: 1.45 }}>
						Stage nodes update from the work-order stream and open persisted output inline.
					</p>
				</div>
				<StatusBadge variant={snapshot.isError ? "error" : "info"} size="sm" isLive={!snapshot.isError}>
					{snapshot.isError ? "stream issue" : "live"}
				</StatusBadge>
			</div>

			<div style={toolbarStyle}>
					<div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap", alignItems: "center", minWidth: 0 }}>
					<AuthorChip name={data?.activeProjectOwner || "Yuriy"} kind="human" role="owner" showRole />
					<StatusBadge variant="neutral" size="sm">
						{activeProjectId}
					</StatusBadge>
					{data?.generatedAt ? <DateTimeText value={data.generatedAt} mode="relative" /> : null}
				</div>
				<label style={toggleStyle}>
					<input
						type="checkbox"
						checked={showMineOnly}
						onChange={(event) => setShowMineOnly(event.currentTarget.checked)}
					/>
					<UserRound aria-hidden="true" size={14} />
					<span>Show only my runs</span>
				</label>
			</div>

			{staleCount > 0 ? (
				<div style={inlinePanelStyle} role="status" aria-live="polite">
					<div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
						<AlertTriangle aria-hidden="true" size={16} />
						<strong>{staleCount} run state needs source review</strong>
					</div>
				</div>
			) : null}

			{snapshot.isLoading && !data ? (
				<div style={inlinePanelStyle}>
					<div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
						<RefreshCw aria-hidden="true" size={16} />
						<span>Loading active runs...</span>
					</div>
				</div>
			) : null}

			{data?.runs.length ? (
				<div style={runListStyle}>
					{data.runs.map((run) => (
						<RunGroup
							key={run.id}
							run={run}
							selectedRunId={selectedRunId}
							selectedStage={selectedStage}
							onSelect={handleSelect}
						/>
					))}
				</div>
			) : (
				<div style={inlinePanelStyle}>
					<div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
						<Activity aria-hidden="true" size={16} />
						<strong>No active runs for this project</strong>
					</div>
					<p style={{ margin: 0, color: "var(--text-body)", fontSize: "var(--sp-6)", lineHeight: 1.45 }}>
						The hierarchy remains visible so the home surface still orients cross-project work.
					</p>
				</div>
			)}

			{hierarchyNodes.length ? (
				<div style={{ display: "grid", gap: "var(--sp-4)", minWidth: 0 }}>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-4)", minWidth: 0 }}>
						<strong style={{ fontSize: "var(--sp-7)" }}>Project hierarchy</strong>
						<StatusBadge variant="neutral" size="sm">
							foundations
						</StatusBadge>
					</div>
					<ReferenceTree nodes={hierarchyNodes} label="Project hierarchy for active runs" />
				</div>
			) : null}
		</section>
	);
}
