import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronRight, PanelRightClose, PanelRightOpen } from "lucide-react";
import type {
	ArtifactReference,
	RightRailItem,
	RightRailState,
	WorkOrderRunState,
} from "lib/types/factory-operator-console";
import { GateCard } from "../GateCard";
import { MergePacket } from "../MergePacket";
import { MockupApprovalGrid } from "../MockupApprovalGrid";
import { PipelineStrip } from "../PipelineStrip";
import { RunStatusBadge } from "../RunStatusBadge";
import { StaleStateNotice } from "../StaleStateNotice";
import { PrimitiveButton, PrimitiveIcon, mutedTextStyle, stackStyle } from "../common";
import { HandoffCard } from "./HandoffCard";

export interface RightRailContextPanelProps {
	state: RightRailState;
	widthPx?: number;
	minWidthPx?: number;
	maxWidthPx?: number;
	onWidthChange?: (widthPx: number) => void;
	onExpandItem?: (itemId: string) => void;
	onCollapse?: () => void;
	onOpenReference?: (reference: ArtifactReference) => void;
	onChatWithReference?: (reference: ArtifactReference) => void;
	onAcceptHandoff?: (handoffId: string) => void;
	onApproveGate?: (item: RightRailItem) => void;
	onAcknowledgeItem?: (itemId: string) => void;
}

function groupItems(items: RightRailItem[], kind: RightRailItem["kind"]) {
	return items.filter((item) => item.kind === kind);
}

function badgeStateForRunStatus(
	status: NonNullable<RightRailItem["runState"]>["status"],
): WorkOrderRunState {
	if (status === "paused_for_gate") return "awaiting_approval";
	if (status === "pending") return "queued";
	return status;
}

const sectionHeadingStyle: CSSProperties = {
	margin: 0,
	textTransform: "uppercase",
	fontFamily: "var(--font-mono)",
	fontSize: "var(--fs-caption)",
	color: "var(--text-tertiary)",
	letterSpacing: 0,
};

const compactActionStyle: CSSProperties = {
	width: "100%",
	minWidth: 0,
	height: "auto",
	minHeight: "var(--factory-control-height)",
	justifyContent: "center",
	padding: "var(--sp-2) var(--sp-4)",
	whiteSpace: "normal",
	lineHeight: 1.2,
	overflowWrap: "anywhere",
};

function statusPillStyle(tone: "neutral" | "attention" | "success"): CSSProperties {
	if (tone === "attention") {
		return {
			borderColor: "var(--accent)",
			background: "var(--bg-soft)",
			color: "var(--accent)",
		};
	}
	if (tone === "success") {
		return {
			borderColor: "var(--success)",
			background: "var(--bg-soft)",
			color: "var(--success)",
		};
	}
	return {};
}

function ProjectStatusStrip({ state }: { state: RightRailState }) {
	const runningCount = groupItems(state.items, "running_work").length;
	const approvalCount = groupItems(state.items, "pending_action").length;
	const blockedCount = groupItems(state.items, "blocked_or_error").length;
	const attentionCount = approvalCount + blockedCount;
	const gateLabel =
		attentionCount > 0 ? `${attentionCount} needs attention` : "all gates green";

	return (
		<section
			aria-label="Project status"
			style={{
				...stackStyle,
				gap: "var(--sp-3)",
				padding: "var(--sp-4)",
				border: "var(--factory-border-width) solid var(--border)",
				borderRadius: "var(--r-card)",
				background: "var(--bg-soft)",
			}}
		>
			<h2 style={sectionHeadingStyle}>Project status</h2>
			<div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)" }}>
				<span className="factory-chip" style={statusPillStyle("neutral")}>
					{runningCount} WOs in flight
				</span>
				<span className="factory-chip" style={statusPillStyle("neutral")}>
					{approvalCount} approvals
				</span>
				<span
					className="factory-chip"
					style={statusPillStyle(attentionCount > 0 ? "attention" : "success")}
				>
					{gateLabel}
				</span>
			</div>
		</section>
	);
}

function isStaleFoundationReview(item: RightRailItem, reference: ArtifactReference): boolean {
	return Boolean(item.staleStateNotice && reference.kind === "foundation");
}

function referenceButtonLabel(
	item: RightRailItem,
	reference: ArtifactReference,
): string {
	if (isStaleFoundationReview(item, reference)) return `Review ${reference.label}`;
	return reference.label;
}

function RightRailCard({
	item,
	onExpandItem,
	onOpenReference,
	onChatWithReference,
	onAcceptHandoff,
	onApproveGate,
	onAcknowledgeItem,
}: {
	item: RightRailItem;
	onExpandItem?: (itemId: string) => void;
	onOpenReference?: (reference: ArtifactReference) => void;
	onChatWithReference?: (reference: ArtifactReference) => void;
	onAcceptHandoff?: (handoffId: string) => void;
	onApproveGate?: (item: RightRailItem) => void;
	onAcknowledgeItem?: (itemId: string) => void;
}) {
	return (
		<article
			className="factory-card"
			style={{
				...stackStyle,
				gap: "var(--sp-4)",
				minWidth: 0,
				padding: "var(--sp-5)",
				overflow: "hidden",
			}}
			data-rail-item-kind={item.kind}
		>
			<button
				type="button"
				onClick={() => onExpandItem?.(item.itemId)}
				aria-expanded={item.expanded}
				style={{
					display: "grid",
					gridTemplateColumns: "minmax(0, 1fr) auto",
					alignItems: "start",
					gap: "var(--sp-3)",
					width: "100%",
					minWidth: 0,
					padding: 0,
					border: 0,
					background: "transparent",
					color: "inherit",
					textAlign: "left",
					cursor: "pointer",
				}}
			>
				<span style={{ minWidth: 0 }}>
					<strong style={{ display: "block", overflowWrap: "anywhere" }}>{item.title}</strong>
					<span
						style={{
							display: "block",
							marginTop: "var(--sp-2)",
							lineHeight: 1.35,
							overflowWrap: "anywhere",
							...mutedTextStyle,
						}}
					>
						{item.summary}
					</span>
				</span>
				<PrimitiveIcon
					icon={ChevronRight}
					style={{
						color: "var(--text-tertiary)",
						transform: item.expanded ? "rotate(90deg)" : undefined,
					}}
				/>
			</button>
			{item.expanded ? (
				<div style={{ ...stackStyle, gap: "var(--sp-4)", minWidth: 0 }}>
					{item.gate ? (
						<GateCard request={item.gate} onApprove={() => onApproveGate?.(item)} />
					) : null}
					{item.mockups ? <MockupApprovalGrid bundle={item.mockups} /> : null}
					{item.mergePacket ? <MergePacket packet={item.mergePacket} /> : null}
					{item.runState ? (
						<div style={{ ...stackStyle, gap: "var(--sp-4)", minWidth: 0 }}>
							<RunStatusBadge state={badgeStateForRunStatus(item.runState.status)} />
							<PipelineStrip
								stages={item.runState.stages.map((stage) => ({
									stageId: stage.stageId,
									role: stage.stageName,
									label: stage.stageName,
									hasOwnerGate: false,
									isParallelizable: false,
								}))}
								currentStageId={item.runState.currentStageId}
							/>
						</div>
					) : null}
					{item.staleStateNotice ? (
						<div style={{ ...stackStyle, gap: "var(--sp-4)" }}>
							<StaleStateNotice notice={item.staleStateNotice} />
							<p style={{ margin: 0, lineHeight: 1.4, ...mutedTextStyle }}>
								Review the change summary, then either keep this in the rail or mark it
								reviewed.
							</p>
							<div style={{ display: "grid", gap: "var(--sp-3)" }}>
								<PrimitiveButton
									variant="secondary"
									onClick={() => onAcknowledgeItem?.(item.itemId)}
								>
									Mark reviewed
								</PrimitiveButton>
								<PrimitiveButton
									variant="ghost"
									onClick={() => onExpandItem?.(item.itemId)}
								>
									Keep in rail
								</PrimitiveButton>
							</div>
						</div>
					) : null}
					{item.handoff ? (
						<HandoffCard handoff={item.handoff} onAccept={onAcceptHandoff} />
					) : null}
				</div>
			) : null}
			{item.references.length > 0 ? (
				<div
					aria-label="Item references"
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fit, minmax(var(--sp-14), 1fr))",
						gap: "var(--sp-3)",
						minWidth: 0,
					}}
				>
					{item.references.map((reference) => (
						<div key={reference.referenceId} style={{ display: "grid", gap: "var(--sp-2)" }}>
							<button
								type="button"
								className="factory-button factory-button--ghost"
								style={compactActionStyle}
								data-rail-target={reference.referenceId}
								data-rail-target-kind={reference.kind}
								aria-label={
									isStaleFoundationReview(item, reference)
										? `Review ${reference.label} foundation change`
										: `Open ${reference.label}`
								}
								onClick={() => {
									if (isStaleFoundationReview(item, reference)) {
										if (!item.expanded) onExpandItem?.(item.itemId);
										return;
									}
									onOpenReference?.(reference);
								}}
							>
								{referenceButtonLabel(item, reference)}
							</button>
							{onChatWithReference ? (
								<button
									type="button"
									className="factory-button factory-button--ghost"
									style={compactActionStyle}
									data-chat-with-pc={reference.referenceId}
									onClick={() => onChatWithReference(reference)}
								>
									Chat about this with PC
								</button>
							) : null}
						</div>
					))}
				</div>
			) : null}
		</article>
	);
}

export function RightRailContextPanel({
	state,
	widthPx = 360,
	minWidthPx = 240,
	maxWidthPx = 480,
	onWidthChange,
	onExpandItem,
	onCollapse,
	onOpenReference,
	onChatWithReference,
	onAcceptHandoff,
	onApproveGate,
	onAcknowledgeItem,
}: RightRailContextPanelProps) {
	const [dragging, setDragging] = useState(false);
	const [startX, setStartX] = useState(0);
	const [startWidth, setStartWidth] = useState(widthPx);
	const [draftWidthPx, setDraftWidthPx] = useState(widthPx);
	const draftWidthRef = useRef(widthPx);
	const frameRef = useRef<number | null>(null);

	const commitWidth = useCallback(
		(nextWidth: number) => {
			const clamped = Math.max(minWidthPx, Math.min(maxWidthPx, nextWidth));
			onWidthChange?.(Math.round(clamped));
		},
		[maxWidthPx, minWidthPx, onWidthChange],
	);
	const previewWidth = useCallback(
		(nextWidth: number) => {
			const clamped = Math.max(minWidthPx, Math.min(maxWidthPx, nextWidth));
			draftWidthRef.current = Math.round(clamped);
			if (frameRef.current !== null) return;
			frameRef.current = window.requestAnimationFrame(() => {
				frameRef.current = null;
				setDraftWidthPx(draftWidthRef.current);
			});
		},
		[maxWidthPx, minWidthPx],
	);

	useEffect(() => {
		if (dragging) return;
		draftWidthRef.current = widthPx;
		setDraftWidthPx(widthPx);
	}, [dragging, widthPx]);

	useEffect(() => {
		if (!dragging) return undefined;
		const onMove = (event: PointerEvent) => {
			previewWidth(startWidth - (event.clientX - startX));
		};
		const onUp = () => {
			commitWidth(draftWidthRef.current);
			setDragging(false);
		};
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp, { once: true });
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			if (frameRef.current !== null) {
				window.cancelAnimationFrame(frameRef.current);
				frameRef.current = null;
			}
		};
	}, [commitWidth, dragging, previewWidth, startWidth, startX]);

	const width = state.collapsed
		? "var(--sp-12)"
		: `${dragging ? draftWidthPx : widthPx}px`;
	const sections: Array<[RightRailItem["kind"], string]> = [
		["pending_action", "Pending action"],
		["running_work", "In-progress"],
		["recently_completed", "Recently completed"],
		["blocked_or_error", "Blocked or error"],
		["reference", "Reference"],
		["handoff", "Handoffs"],
	];
	const collapseLabel = state.collapsed ? "Expand right rail" : "Collapse right rail";

	return (
		<aside
			className="factory-card"
			aria-label="Coordinator right rail"
			style={{
				position: "relative",
				width,
				minWidth: width,
				maxWidth: width,
				height: "100%",
				borderRadius: 0,
				overflow: "hidden",
			}}
		>
			<div
				className="factory-rail-resize-handle"
				role="separator"
				aria-orientation="vertical"
				aria-label="Resize right rail"
				tabIndex={0}
				data-active={dragging ? "true" : "false"}
				onPointerDown={(event) => {
					setDragging(true);
					setStartX(event.clientX);
					setStartWidth(widthPx);
					event.currentTarget.setPointerCapture(event.pointerId);
				}}
				onKeyDown={(event) => {
					if (event.key === "ArrowLeft") commitWidth(widthPx + 16);
					if (event.key === "ArrowRight") commitWidth(widthPx - 16);
				}}
			/>
			<div
				style={{
					...stackStyle,
					gap: "var(--sp-5)",
					height: "100%",
					padding: "var(--sp-6)",
					overflow: "auto",
				}}
			>
				<header
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: "var(--sp-3)",
					}}
				>
					<strong style={{ minWidth: 0, overflowWrap: "anywhere" }}>{state.projectId}</strong>
					<PrimitiveButton
						variant="ghost"
						aria-label={collapseLabel}
						title={collapseLabel}
						onClick={onCollapse}
					>
						{state.collapsed ? (
							<PrimitiveIcon icon={PanelRightOpen} />
						) : (
							<PrimitiveIcon icon={PanelRightClose} />
						)}
					</PrimitiveButton>
				</header>
				{state.collapsed ? null : (
					<>
						<ProjectStatusStrip state={state} />
						{sections.map(([kind, label]) => {
							const items = groupItems(state.items, kind);
							if (items.length === 0) return null;
							return (
								<section key={kind} style={stackStyle} aria-label={label}>
									<h2 style={sectionHeadingStyle}>{label}</h2>
									{items.map((item) => (
										<RightRailCard
											key={item.itemId}
											item={item}
											onExpandItem={onExpandItem}
											onOpenReference={onOpenReference}
											onChatWithReference={onChatWithReference}
											onAcceptHandoff={onAcceptHandoff}
											onApproveGate={onApproveGate}
											onAcknowledgeItem={onAcknowledgeItem}
										/>
									))}
								</section>
							);
						})}
					</>
				)}
				{!state.collapsed && state.items.length === 0 ? (
					<p style={mutedTextStyle}>
						No items pending. Coordinator will surface relevant items as you work.
					</p>
				) : null}
			</div>
		</aside>
	);
}
