import type { ReactNode } from "react";
import { DateTimeText } from "../DateTimeText";
import { StatusBadge } from "../StatusBadge";
import { s, textBase, v } from "../componentInternals";

export interface AuditLogEntryProps {
	title: string;
	time: string | Date;
	source: string;
	severity?: "info" | "warning" | "blocker";
	children?: ReactNode;
}

export function AuditLogEntry({ title, time, source, severity = "info", children }: AuditLogEntryProps) {
	return (
		<article data-vecreal-component="AuditLogEntry" style={{ ...textBase, display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: s.px5 }}>
			<StatusBadge variant={severity === "blocker" ? "error" : severity === "warning" ? "warning" : "info"} size="sm">
				{severity}
			</StatusBadge>
			<div style={{ display: "grid", gap: s.px2 }}>
				<strong style={{ fontSize: s.px7 }}>{title}</strong>
				<div style={{ display: "flex", gap: s.px4, color: v.muted, fontSize: s.px6 }}>
					<DateTimeText value={time} />
					<span>{source}</span>
				</div>
				{children ? <div style={{ color: v.body, fontSize: s.px7 }}>{children}</div> : null}
			</div>
		</article>
	);
}
