import type { ReactNode } from "react";
import { Card } from "../Card";
import { s, v } from "../componentInternals";

export interface EmptyStateProps {
	title: string;
	message: string;
	action?: ReactNode;
}

export function EmptyState({ title, message, action }: EmptyStateProps) {
	return (
		<Card variant="compact">
			<h3 style={{ margin: 0, fontSize: s.px8 }}>{title}</h3>
			<p style={{ margin: 0, color: v.body, fontSize: s.px7 }}>{message}</p>
			{action}
		</Card>
	);
}
