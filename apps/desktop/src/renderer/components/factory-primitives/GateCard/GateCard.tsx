import { Check, MoreHorizontal } from "lucide-react";
import type { GateChoice, GateRequest } from "lib/types/factory-operator-console";
import {
	PrimitiveButton,
	PrimitiveIcon,
	cardPaddingStyle,
	mutedTextStyle,
	rowStyle,
	stackStyle,
} from "../common";

export interface GateCardProps {
	request: GateRequest;
	onApprove?: () => void;
	onRevise?: (guidance: string) => void;
	onEscalate?: () => void;
	variant?: "standard" | "mockup" | "merge";
}

function choiceLabel(choices: GateChoice[], kind: GateChoice["kind"], fallback: string) {
	return choices.find((choice) => choice.kind === kind)?.label || fallback;
}

export function GateCard({
	request,
	onApprove,
	onRevise,
	onEscalate,
	variant = "standard",
}: GateCardProps) {
	return (
		<section
			className="factory-card"
			aria-label={`${request.prompt} gate`}
			data-gate-variant={variant}
			style={{ ...cardPaddingStyle, ...stackStyle }}
		>
			<header style={{ ...rowStyle, justifyContent: "space-between" }}>
				<div style={stackStyle}>
					<span className="factory-chip factory-chip--attention" style={{ padding: "0 var(--sp-4)" }}>
						Awaiting you
					</span>
					<strong>{request.prompt}</strong>
					<span style={mutedTextStyle}>{request.context}</span>
				</div>
				<PrimitiveIcon icon={MoreHorizontal} style={{ color: "var(--text-tertiary)" }} />
			</header>
			<div style={rowStyle} aria-label="Gate actions">
				<PrimitiveButton variant="secondary" icon={Check} onClick={onApprove}>
					{choiceLabel(request.choices, "approve", "Approve")}
				</PrimitiveButton>
				<PrimitiveButton
					variant="ghost"
					onClick={() => onRevise?.("")}
				>
					{choiceLabel(request.choices, "revise", "Revise")}
				</PrimitiveButton>
				<PrimitiveButton variant="ghost" onClick={onEscalate}>
					{choiceLabel(request.choices, "escalate", "Details")}
				</PrimitiveButton>
			</div>
		</section>
	);
}
