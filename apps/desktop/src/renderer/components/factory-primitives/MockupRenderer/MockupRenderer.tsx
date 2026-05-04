import { Maximize2 } from "lucide-react";
import type { Mockup } from "lib/types/factory-operator-console";
import {
	PrimitiveButton,
	cardPaddingStyle,
	formatDateTime,
	mutedTextStyle,
	stackStyle,
} from "../common";

export interface MockupRendererProps {
	mockup: Mockup;
	size?: "thumbnail" | "inline" | "modal";
	onApprove?: () => void;
	onRequestRevision?: (guidance: string) => void;
}

export function MockupRenderer({
	mockup,
	size = "inline",
	onApprove,
	onRequestRevision,
}: MockupRendererProps) {
	return (
		<figure
			className="factory-card"
			style={{
				...cardPaddingStyle,
				...stackStyle,
				maxWidth: size === "thumbnail" ? "var(--sp-14)" : undefined,
				margin: 0,
			}}
		>
			<div
				aria-label={mockup.caption || `Mockup ${mockup.index}`}
				style={{
					display: "grid",
					placeItems: "center",
					minHeight: size === "thumbnail" ? "var(--sp-14)" : "calc(var(--sp-14) * 3)",
					borderRadius: "var(--r-5)",
					border: "var(--factory-border-width) solid var(--border)",
					background: "var(--bg-soft)",
					color: "var(--text-tertiary)",
					fontFamily: "var(--font-mono)",
				}}
			>
				{mockup.path}
			</div>
			<figcaption style={{ ...stackStyle, gap: "var(--sp-2)" }}>
				<strong>{mockup.caption || `Mockup ${mockup.index}`}</strong>
				<span style={mutedTextStyle}>Generated {formatDateTime(mockup.generatedAt)}</span>
			</figcaption>
			{(onApprove || onRequestRevision) && (
				<div style={{ display: "flex", gap: "var(--sp-4)" }}>
					{onApprove && (
						<PrimitiveButton variant="secondary" icon={Maximize2} onClick={onApprove}>
							Approve
						</PrimitiveButton>
					)}
					{onRequestRevision && (
						<PrimitiveButton variant="ghost" onClick={() => onRequestRevision("")}>
							Revise
						</PrimitiveButton>
					)}
				</div>
			)}
		</figure>
	);
}
