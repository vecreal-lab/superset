import { AlertTriangle } from "lucide-react";
import type { StaleStateNotice as StaleStateNoticeShape } from "lib/types/factory-operator-console";
import {
	PrimitiveButton,
	PrimitiveIcon,
	cardPaddingStyle,
	mutedTextStyle,
	rowStyle,
	stackStyle,
} from "../common";

export interface StaleStateNoticeProps {
	notice: StaleStateNoticeShape;
	onAcknowledge?: () => void;
	onContinueAgainstNewState?: () => void;
}

export function StaleStateNotice({
	notice,
	onAcknowledge,
	onContinueAgainstNewState,
}: StaleStateNoticeProps) {
	const summary =
		notice.changeSummary || notice.summary || "Upstream state changed.";
	return (
		<section
			className="factory-card"
			aria-label="Stale state notice"
			style={{
				...cardPaddingStyle,
				...stackStyle,
				borderColor: "var(--warning)",
			}}
		>
			<div style={rowStyle}>
				<PrimitiveIcon icon={AlertTriangle} style={{ color: "var(--warning)" }} />
				<strong>Review newer state before continuing</strong>
			</div>
			<p style={{ margin: 0, ...mutedTextStyle }}>{summary}</p>
			{(onAcknowledge || onContinueAgainstNewState) && (
				<div style={rowStyle}>
					{onContinueAgainstNewState && (
						<PrimitiveButton variant="secondary" onClick={onContinueAgainstNewState}>
							Use newer state
						</PrimitiveButton>
					)}
					{onAcknowledge && (
						<PrimitiveButton variant="ghost" onClick={onAcknowledge}>
							Acknowledge
						</PrimitiveButton>
					)}
				</div>
			)}
		</section>
	);
}
