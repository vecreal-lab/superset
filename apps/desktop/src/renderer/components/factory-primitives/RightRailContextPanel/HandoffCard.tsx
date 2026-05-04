import { ArrowRightLeft } from "lucide-react";
import type { CoordinatorHandoff } from "lib/types/factory-operator-console";
import {
	PrimitiveButton,
	PrimitiveIcon,
	cardPaddingStyle,
	mutedTextStyle,
	rowStyle,
	stackStyle,
} from "../common";

export interface HandoffCardProps {
	handoff: CoordinatorHandoff;
	onAccept?: (handoffId: string) => void;
	onReturn?: (handoffId: string) => void;
}

export function HandoffCard({ handoff, onAccept, onReturn }: HandoffCardProps) {
	return (
		<section
			className="factory-card"
			aria-label={`Handoff ${handoff.handoffId}`}
			style={{ ...cardPaddingStyle, ...stackStyle }}
		>
			<header style={rowStyle}>
				<PrimitiveIcon icon={ArrowRightLeft} style={{ color: "var(--accent)" }} />
				<div>
					<strong>{handoff.summary}</strong>
					<div style={mutedTextStyle}>{handoff.requestedAction}</div>
				</div>
			</header>
			<div style={mutedTextStyle}>
				{handoff.from.coordinatorRole} to {handoff.to.coordinatorRole}
			</div>
			<div style={rowStyle}>
				<PrimitiveButton variant="secondary" onClick={() => onAccept?.(handoff.handoffId)}>
					Accept
				</PrimitiveButton>
				<PrimitiveButton variant="ghost" onClick={() => onReturn?.(handoff.handoffId)}>
					Return
				</PrimitiveButton>
			</div>
		</section>
	);
}
