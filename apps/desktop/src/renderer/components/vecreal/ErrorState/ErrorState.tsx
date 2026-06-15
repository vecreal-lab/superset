import type { ReactNode } from "react";
import { Card } from "../Card";
import { StatusBadge } from "../StatusBadge";
import { s, v } from "../componentInternals";

export interface ErrorStateProps {
	title: string;
	message: string;
	action?: ReactNode;
	details?: ReactNode;
}

export function ErrorState({ title, message, action, details }: ErrorStateProps) {
	return (
		<Card variant="evidence" style={{ borderColor: v.error }}>
			<StatusBadge variant="error">Error</StatusBadge>
			<h3 style={{ margin: 0, fontSize: s.px8 }}>{title}</h3>
			<p style={{ margin: 0, color: v.body, fontSize: s.px7 }}>{message}</p>
			{details ? <details><summary>Technical details</summary>{details}</details> : null}
			{action}
		</Card>
	);
}
