import { Card } from "../Card";
import { StatusBadge } from "../StatusBadge";
import { s, textBase, v } from "../componentInternals";

export interface LoadingStateProps {
	label: string;
	variant?: "inline" | "panel" | "skeleton";
	delayed?: boolean;
}

export function LoadingState({ label, variant = "inline", delayed }: LoadingStateProps) {
	const body = (
		<div role="status" aria-live="polite" aria-busy="true" data-vecreal-component="LoadingState" style={{ ...textBase, display: "inline-flex", alignItems: "center", gap: s.px4, color: delayed ? v.warning : v.body }}>
			<StatusBadge variant={delayed ? "warning" : "info"} isLive>{variant === "skeleton" ? "Loading" : "Working"}</StatusBadge>
			<span>{label}</span>
		</div>
	);
	return variant === "panel" || variant === "skeleton" ? <Card variant="compact">{body}</Card> : body;
}
