import { useCallback, useEffect, useRef, useState } from "react";
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
import { PrimitiveButton, PrimitiveIcon, cardPaddingStyle, mutedTextStyle, rowStyle, stackStyle } from "../common";
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
}

function itemKindLabel(kind: RightRailItem["kind"]): string {
	return kind.replace(/_/g, " ");
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

function RightRailCard({
	item,
	onExpandItem,
	onOpenReference,
	onChatWithReference,
	onAcceptHandoff,
	onApproveGate,
}: {
	item: RightRailItem;
	onExpandItem?: (itemId: string) => void;
	onOpenReference?: (reference: ArtifactReference) => void;
	onChatWithReference?: (reference: ArtifactReference) => void;
	onAcceptHandoff?: (handoffId: string) => void;
	onApproveGate?: (item: RightRailItem) => void;
}) {
	return (
		<article
			className="factory-card"
			style={{ ...cardPaddingStyle, ...stackStyle }}
			data-rail-item-kind={item.kind}
		>
			<button
				type="button"
				className="factory-button factory-button--ghost"
				onClick={() => onExpandItem?.(item.itemId)}
				style={{ justifyContent: "space-between", width: "100%" }}
			>
				<span style={{ textAlign: "left" }}>
					<strong>{item.title}</strong>
					<span style={{ display: "block", ...mutedTextStyle }}>{item.summary}</span>
				</span>
				<PrimitiveIcon icon={ChevronRight} />
			</button>
			{item.expanded && item.gate && (
				<GateCard request={item.gate} onApprove={() => onApproveGate?.(item)} />
			)}
			{item.expanded && item.mockups && <MockupApprovalGrid bundle={item.mockups} />}
			{item.expanded && item.mergePacket && <MergePacket packet={item.mergePacket} />}
			{item.expanded && item.runState && (
				<div style={stackStyle}>
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
			)}
			{item.expanded && item.staleStateNotice && (
				<StaleStateNotice notice={item.staleStateNotice} />
			)}
			{item.expanded && item.handoff && (
				<HandoffCard handoff={item.handoff} onAccept={onAcceptHandoff} />
			)}
			{item.references.length > 0 && (
				<div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-3)" }}>
					{item.references.map((reference) => (
						<span key={reference.referenceId} style={rowStyle}>
							<button
								type="button"
								className="factory-button factory-button--ghost"
								data-rail-target={reference.referenceId}
								data-rail-target-kind={reference.kind}
								onClick={() => onOpenReference?.(reference)}
							>
								{reference.label}
							</button>
							{onChatWithReference && (
								<button
									type="button"
									className="factory-button factory-button--ghost"
									data-chat-with-pc={reference.referenceId}
									onClick={() => onChatWithReference(reference)}
								>
									Chat about this with PC
								</button>
							)}
						</span>
					))}
				</div>
			)}
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
			<div style={{ ...stackStyle, height: "100%", padding: "var(--sp-6)", overflow: "auto" }}>
				<header style={{ ...rowStyle, justifyContent: "space-between" }}>
					<strong>{state.projectId}</strong>
					<PrimitiveButton variant="ghost" onClick={onCollapse}>
						{state.collapsed ? (
							<PrimitiveIcon icon={PanelRightOpen} />
						) : (
							<PrimitiveIcon icon={PanelRightClose} />
						)}
					</PrimitiveButton>
				</header>
				{state.collapsed ? null : (
					sections.map(([kind, label]) => {
						const items = groupItems(state.items, kind);
						if (items.length === 0) return null;
						return (
							<section key={kind} style={stackStyle} aria-label={label}>
								<h2
									style={{
										margin: 0,
										textTransform: "uppercase",
										fontFamily: "var(--font-mono)",
										fontSize: "var(--sp-5)",
										color: "var(--text-tertiary)",
									}}
								>
									{label}
								</h2>
								{items.map((item) => (
									<RightRailCard
										key={item.itemId}
										item={item}
										onExpandItem={onExpandItem}
										onOpenReference={onOpenReference}
										onChatWithReference={onChatWithReference}
										onAcceptHandoff={onAcceptHandoff}
										onApproveGate={onApproveGate}
									/>
								))}
							</section>
						);
					})
				)}
				{!state.collapsed && state.items.length === 0 && (
					<p style={mutedTextStyle}>
						No items pending. Coordinator will surface relevant items as you work.
					</p>
				)}
				<span style={{ display: "none" }}>{itemKindLabel("pending_action")}</span>
			</div>
		</aside>
	);
}
