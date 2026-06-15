import type { ReactNode } from "react";
import { Button, type ButtonVariant } from "../Button";
import { Card } from "../Card";
import { GateAdvancePulse } from "../GateAdvancePulse";
import { StatusBadge, type StatusBadgeVariant } from "../StatusBadge";
import { s, srOnly, v } from "../componentInternals";

export interface GateCardProps {
	title: string;
	summary: string;
	status?: "pending" | "approved" | "revised" | "blocked";
	actions?: Array<{ label: string; variant?: ButtonVariant; onClick?: () => void }>;
	children?: ReactNode;
}

export function GateCard({ title, summary, status = "pending", actions = [], children }: GateCardProps) {
	const statusVariant: Record<NonNullable<GateCardProps["status"]>, StatusBadgeVariant> = {
		pending: "warning",
		approved: "success",
		revised: "info",
		blocked: "error",
	};
	return (
		<Card variant="interactive">
			<div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: s.px8 }}>
				<div style={{ display: "grid", gap: s.px3 }}>
					<h3 style={{ margin: 0, fontSize: s.px8, lineHeight: 1.25 }}>{title}</h3>
					<p style={{ margin: 0, color: v.body, fontSize: s.px7, lineHeight: 1.45 }}>{summary}</p>
				</div>
				<StatusBadge variant={statusVariant[status]} isLive={status === "pending"}>
					{status}
				</StatusBadge>
			</div>
			{status === "pending" ? (
				<GateAdvancePulse state="active" label={title}>
					<span style={srOnly()}>{title} awaiting approval</span>
				</GateAdvancePulse>
			) : null}
			{children}
			{actions.length ? (
				<div style={{ display: "flex", flexWrap: "wrap", gap: s.px4 }}>
					{actions.map((action) => (
						<Button key={action.label} variant={action.variant ?? "secondary"} size="sm" onClick={action.onClick}>
							{action.label}
						</Button>
					))}
				</div>
			) : null}
		</Card>
	);
}
