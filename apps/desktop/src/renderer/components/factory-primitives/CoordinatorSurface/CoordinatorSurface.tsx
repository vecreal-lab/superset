import { Paperclip, Send } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type {
	ArtifactReference,
	AuthorAttribution,
	CoordinatorDialogueTurn,
	CoordinatorSurfaceContext,
	DialogueTurn,
} from "lib/types/factory-operator-console";
import { AuthorChip } from "../AuthorChip";
import { EntityMentionLink } from "../EntityMentionLink";
import { PrimitiveIcon, cx, mutedTextStyle, rowStyle, stackStyle } from "../common";
import { ResearchAttachmentDropZone } from "./ResearchAttachmentDropZone";

type CoordinatorSurfaceTurn = DialogueTurn | CoordinatorDialogueTurn;

export interface CoordinatorSurfaceProps {
	context: CoordinatorSurfaceContext;
	turns: CoordinatorSurfaceTurn[];
	rightRail?: ReactNode;
	inlineCards?: Record<string, ReactNode>;
	draftComposerText?: string;
	composerReferences?: ArtifactReference[];
	onSend?: (message: string) => void;
	onAttach?: () => void;
	onDraftChange?: (draft: string) => void;
	onMentionActivate?: (reference: ArtifactReference) => void;
}

function turnAuthor(turn: CoordinatorSurfaceTurn): AuthorAttribution {
	if (typeof turn.author !== "string") return turn.author;
	return {
		user: turn.author,
		role: turn.agentRole,
		isAgent: turn.role === "agent",
		displayName:
			turn.role === "agent" ? turn.agentRole || "Project Coordinator" : turn.author,
	};
}

function MessageText({
	text,
	onMentionActivate,
}: {
	text: string;
	onMentionActivate?: (reference: ArtifactReference) => void;
}) {
	const parts = text.split(/(WO-[A-Z0-9.]+|C[0-9]+(?:\.[0-9]+)?)/g);
	return (
		<>
			{parts.map((part, index) => {
				if (!/^WO-|^C[0-9]/.test(part)) return <span key={`${part}-${index}`}>{part}</span>;
				return (
					<EntityMentionLink
						key={`${part}-${index}`}
						reference={{
							referenceId: part,
							kind: "work_order",
							label: part,
							route: `/factory/work-orders/${part}`,
						}}
						onActivate={onMentionActivate}
					/>
				);
			})}
		</>
	);
}

export function CoordinatorSurface({
	context,
	turns,
	rightRail,
	inlineCards = {},
	draftComposerText = "",
	composerReferences,
	onSend,
	onAttach,
	onDraftChange,
	onMentionActivate,
}: CoordinatorSurfaceProps) {
	const [draft, setDraft] = useState(draftComposerText);
	const references = composerReferences ?? context.currentReferences;
	useEffect(() => {
		setDraft(draftComposerText);
	}, [draftComposerText]);
	const submit = () => {
		const trimmed = draft.trim();
		if (!trimmed) return;
		onSend?.(trimmed);
		setDraft("");
		onDraftChange?.("");
	};
	return (
		<section
			aria-label={`${context.coordinatorRole} surface`}
			style={{
				display: "grid",
				gridTemplateColumns: rightRail ? "minmax(0, 1fr) auto" : "minmax(0, 1fr)",
				height: "100%",
				minHeight: 0,
				background: "var(--bg-app)",
			}}
		>
			<div
				style={{
					display: "grid",
					gridTemplateRows: "minmax(0, 1fr) auto",
					minHeight: 0,
					borderRight: rightRail ? "var(--factory-border-width) solid var(--border)" : undefined,
				}}
			>
				<div
					role="log"
					aria-label="Coordinator messages"
					style={{
						...stackStyle,
						overflow: "auto",
						padding: "var(--sp-8)",
					}}
				>
					{turns.map((turn) => (
						<article
							key={turn.turnId}
							className={cx("factory-card", turn.role === "operator" && "operator-turn")}
							style={{
								...stackStyle,
								gap: "var(--sp-3)",
								padding: "var(--sp-6)",
								background: turn.role === "operator" ? "var(--bg-soft)" : "var(--bg-card)",
							}}
						>
							<AuthorChip
								attribution={turnAuthor(turn)}
								size="sm"
								variant="inline"
							/>
							<p style={{ margin: 0, color: "var(--text-secondary)" }}>
								<MessageText text={turn.text} onMentionActivate={onMentionActivate} />
							</p>
							{inlineCards[turn.turnId]}
						</article>
					))}
				</div>
				<form
					aria-label="Message Project Coordinator"
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
					style={{
						...stackStyle,
						padding: "var(--sp-6)",
						borderTop: "var(--factory-border-width) solid var(--border)",
						background: "var(--bg-card-bottom)",
					}}
				>
					{(context.activeMode === "research_intake" || references.length > 0) && (
						<ResearchAttachmentDropZone
							references={references}
							onReferenceActivate={onMentionActivate}
						/>
					)}
					<div style={rowStyle}>
						<button
							type="button"
							className="factory-icon-button"
							aria-label="Attach reference"
							title="Attach reference"
							onClick={onAttach}
						>
							<PrimitiveIcon icon={Paperclip} />
						</button>
						<input
							value={draft}
							onChange={(event) => {
								setDraft(event.currentTarget.value);
								onDraftChange?.(event.currentTarget.value);
							}}
							placeholder={`Message ${context.coordinatorRole}...`}
							aria-label={`Message ${context.coordinatorRole}`}
							style={{
								flex: 1,
								height: "var(--factory-control-height)",
								border: "var(--factory-border-width) solid var(--border)",
								borderRadius: "var(--r-3)",
								background: "var(--bg-app)",
								color: "var(--text-primary)",
								padding: "0 var(--sp-6)",
							}}
						/>
						<button
							type="submit"
							className="factory-button factory-button--primary"
							aria-label="Send message"
							title="Send message"
						>
							<PrimitiveIcon icon={Send} />
						</button>
					</div>
					<span style={{ ...mutedTextStyle, fontFamily: "var(--font-mono)" }}>
						Project Coordinator runtime is active for this project.
					</span>
				</form>
			</div>
			{rightRail}
		</section>
	);
}
