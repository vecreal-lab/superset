import { Paperclip, Send } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type {
	ArtifactReference,
	AuthorAttribution,
	CoordinatorDialogueTurn,
	CoordinatorSurfaceContext,
	DialogueTurn,
} from "lib/types/factory-operator-console";
import { AuthorChip } from "../AuthorChip";
import { EntityMentionLink } from "../EntityMentionLink";
import { PrimitiveIcon, stackStyle } from "../common";
import { ResearchAttachmentDropZone } from "./ResearchAttachmentDropZone";

type CoordinatorSurfaceTurn = DialogueTurn | CoordinatorDialogueTurn;

const pcTagStyle: CSSProperties = {
	height: "var(--sp-9)",
	padding: "0 var(--sp-4)",
	fontFamily: "var(--font-mono)",
	fontSize: "var(--sp-5)",
	fontWeight: 600,
};

export interface CoordinatorSurfaceProps {
	context: CoordinatorSurfaceContext;
	turns: CoordinatorSurfaceTurn[];
	rightRail?: ReactNode;
	inlineCards?: Record<string, ReactNode>;
	draftComposerText?: string;
	composerReferences?: ArtifactReference[];
	isPending?: boolean;
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
				if (!/^WO-|^C[0-9]/.test(part)) {
					return <span key={`${part}-${index}`}>{part}</span>;
				}
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
	isPending = false,
	onSend,
	onAttach,
	onDraftChange,
	onMentionActivate,
}: CoordinatorSurfaceProps) {
	const [draft, setDraft] = useState(draftComposerText);
	const references = composerReferences ?? context.currentReferences;
	const showAttachmentDropZone =
		context.activeMode === "research_intake" || references.length > 0;

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

	const setPromptDraft = (prompt: string) => {
		setDraft(prompt);
		onDraftChange?.(prompt);
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
					borderRight: rightRail
						? "var(--factory-border-width) solid var(--border)"
						: undefined,
				}}
			>
				<div
					role="log"
					aria-label="Coordinator messages"
					style={{
						...stackStyle,
						gap: "var(--sp-5)",
						overflow: "auto",
						padding: "var(--sp-8) var(--sp-10) var(--sp-4)",
					}}
				>
					{turns.length === 0 ? (
						<FirstArrivalState projectId={context.projectId} onPrompt={setPromptDraft} />
					) : null}
					{turns.map((turn) => (
						<DialogueTurnView
							key={turn.turnId}
							turn={turn}
							inlineCard={inlineCards[turn.turnId]}
							onMentionActivate={onMentionActivate}
						/>
					))}
					{isPending ? <CoordinatorPendingIndicator /> : null}
				</div>
				<form
					aria-label="Message Project Coordinator"
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
					style={{
						display: "grid",
						gap: showAttachmentDropZone ? "var(--sp-4)" : 0,
						minHeight: "var(--factory-composer-height)",
						margin: "0 var(--sp-10) var(--sp-5)",
						padding: "var(--sp-3)",
						border: "var(--factory-border-width) solid var(--border)",
						borderRadius: "var(--r-card)",
						background: "var(--bg-card)",
						boxShadow: "var(--shadow-card)",
					}}
				>
					{showAttachmentDropZone ? (
						<ResearchAttachmentDropZone
							references={references}
							onReferenceActivate={onMentionActivate}
						/>
					) : null}
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "auto minmax(0, 1fr) auto",
							gap: "var(--sp-3)",
							alignItems: "center",
							minHeight: "var(--factory-control-height)",
						}}
					>
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
								width: "100%",
								minWidth: 0,
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
							style={{
								width: "calc(var(--factory-control-height) + var(--sp-2))",
								height: "var(--factory-control-height)",
								padding: 0,
							}}
						>
							<PrimitiveIcon icon={Send} />
						</button>
					</div>
				</form>
			</div>
			{rightRail}
		</section>
	);
}

function FirstArrivalState({
	projectId,
	onPrompt,
}: {
	projectId: string;
	onPrompt: (prompt: string) => void;
}) {
	const prompts = [
		"What needs my attention next?",
		"Show me the next gate decision.",
	] as const;

	return (
		<article
			aria-label="Project Coordinator first arrival message"
			style={{
				maxWidth: "var(--factory-chat-measure)",
				padding: "var(--sp-3) var(--sp-4)",
				color: "var(--text-primary)",
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
				<span className="factory-chip factory-chip--attention" style={pcTagStyle}>
					PC
				</span>
				<strong>Project Coordinator</strong>
			</div>
			<p style={{ margin: "var(--sp-3) 0 0", lineHeight: 1.5 }}>
				{projectId} is open. I can help move the next work order, explain what is in
				the right rail, or draft the next operator handoff.
			</p>
			<div
				aria-label="Suggested first prompts"
				style={{
					display: "flex",
					flexWrap: "wrap",
					gap: "var(--sp-3)",
					marginTop: "var(--sp-4)",
				}}
			>
				{prompts.map((prompt) => (
					<button
						key={prompt}
						type="button"
						className="factory-button factory-button--ghost"
						onClick={() => onPrompt(prompt)}
					>
						{prompt}
					</button>
				))}
			</div>
		</article>
	);
}

function DialogueTurnView({
	turn,
	inlineCard,
	onMentionActivate,
}: {
	turn: CoordinatorSurfaceTurn;
	inlineCard?: ReactNode;
	onMentionActivate?: (reference: ArtifactReference) => void;
}) {
	if (turn.role === "operator") {
		return (
			<article
				aria-label={`Operator message from ${turnAuthor(turn).displayName}`}
				style={{
					width: "100%",
					minWidth: 0,
					padding: "var(--sp-5) var(--sp-7)",
					border: "var(--factory-border-width) solid var(--border)",
					borderRadius: "var(--r-card)",
					background: "var(--bg-soft)",
					boxShadow: "var(--shadow-card)",
				}}
			>
				<AuthorChip attribution={turnAuthor(turn)} size="sm" variant="inline" />
				<p
					style={{
						margin: "var(--sp-3) 0 0",
						color: "var(--text-primary)",
						lineHeight: 1.5,
					}}
				>
					<MessageText text={turn.text} onMentionActivate={onMentionActivate} />
				</p>
				{inlineCard ? <div style={{ marginTop: "var(--sp-3)" }}>{inlineCard}</div> : null}
			</article>
		);
	}

	return (
		<article
			aria-label={`Project Coordinator message from ${turnAuthor(turn).displayName}`}
			style={{
				maxWidth: "var(--factory-chat-measure)",
				minWidth: 0,
				padding: "var(--sp-3) var(--sp-4)",
				color: "var(--text-primary)",
			}}
		>
			<p style={{ margin: 0, lineHeight: 1.5 }}>
				<span
					style={{
						display: "inline-flex",
						alignItems: "center",
						gap: "var(--sp-3)",
						marginRight: "var(--sp-3)",
					}}
				>
					<AuthorChip attribution={turnAuthor(turn)} size="sm" variant="inline" />
					<span className="factory-chip factory-chip--attention" style={pcTagStyle}>
						PC
					</span>
				</span>
				<MessageText text={turn.text} onMentionActivate={onMentionActivate} />
			</p>
			{inlineCard ? <div style={{ marginTop: "var(--sp-4)" }}>{inlineCard}</div> : null}
		</article>
	);
}

function CoordinatorPendingIndicator() {
	const barStyle: CSSProperties = {
		width: "var(--sp-1)",
		height: "var(--sp-8)",
		borderRadius: "var(--r-pill)",
		background: "var(--accent)",
	};

	return (
		<div
			aria-live="polite"
			aria-label="Project Coordinator is drafting"
			style={{
				display: "flex",
				alignItems: "center",
				gap: "var(--sp-3)",
				minHeight: "var(--sp-9)",
				color: "var(--text-secondary)",
			}}
		>
			<span
				aria-hidden="true"
				style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-1)" }}
			>
				<span style={{ ...barStyle, opacity: 0.55 }} />
				<span style={{ ...barStyle, height: "var(--sp-7)", opacity: 0.75 }} />
				<span style={{ ...barStyle, opacity: 0.95 }} />
			</span>
			<span style={{ fontSize: "var(--fs-caption)" }}>Project Coordinator is drafting</span>
		</div>
	);
}
