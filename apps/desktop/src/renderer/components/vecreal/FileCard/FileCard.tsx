import type { ReactNode } from "react";
import { Card } from "../Card";
import { StatusBadge } from "../StatusBadge";
import { s, v } from "../componentInternals";

export interface FileCardProps {
	name: string;
	type?: string;
	status?: "uploading" | "ready" | "missing" | "selected";
	meta?: string;
	action?: ReactNode;
}

export function FileCard({ name, type = "file", status = "ready", meta, action }: FileCardProps) {
	return (
		<Card variant={status === "selected" ? "interactive" : "compact"} selected={status === "selected"}>
			<div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: s.px6 }}>
				<div style={{ display: "grid", gap: s.px2, minWidth: 0 }}>
					<strong style={{ fontSize: s.px7, overflow: "hidden", textOverflow: "ellipsis" }}>{name}</strong>
					<span style={{ color: v.muted, fontSize: s.px6 }}>{type}{meta ? ` / ${meta}` : ""}</span>
				</div>
				<StatusBadge variant={status === "missing" ? "error" : status === "uploading" ? "warning" : "success"} size="sm">
					{status}
				</StatusBadge>
			</div>
			{action}
		</Card>
	);
}
