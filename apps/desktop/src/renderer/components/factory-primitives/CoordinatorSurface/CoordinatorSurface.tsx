import { Paperclip, Send } from "lucide-react";
import { useState, type ReactNode } from "react";
import type {
	CoordinatorSurfaceContext,
	DialogueTurn,
} from "lib/types/factory-operator-console";
import { AuthorChip } from "../AuthorChip";
import { EntityMentionLink } from "../EntityMentionLink";
import { PrimitiveIcon, cx, mutedTextStyle, rowStyle, stackStyle } from "../common";
import { ResearchAttachmentDropZone } from "./ResearchAttachmentDropZone";

export interface CoordinatorSurfaceProps {
	context: CoordinatorSurfaceContext;
	turns: DialogueTurn[];
	rightRail?: ReactNode;
	inlineCards?: Record<string, ReactNode>;
	onSend?: (message: string) => void;
	onAttach?: () => void;
}

function turnAuthor(turn: DialogueTurn) {
	return {
		user: turn.author,
		role: turn.agentRole,
		isAgent: turn.role === "agent",
		displayName:
			turn.role === "agent" ? turn.agentRole || "Project Coordinator" : turn.author,
	};
}

function MessageText({ text }: { text: string }) {
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
	onSend,
	onAttach,
}: CoordinatorSurfaceProps) {
	const [draft, setDraft] = useState("");
	const submit = () => {
		const trimmed = draft.trim();
		if (!trimmed) return;
		onSend?.(trimmed);
		setDraft("");
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
								<MessageText text={turn.text} />
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
					{context.activeMode === "research_intake" && (
						<ResearchAttachmentDropZone references={context.currentReferences} />
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
							onChange={(event) => setDraft(event.currentTarget.value)}
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
						Coordinator runtime deferred to WO-C26.3-NEW; this surface renders the contract.
					</span>
				</form>
			</div>
			{rightRail}
		</section>
	);
}
