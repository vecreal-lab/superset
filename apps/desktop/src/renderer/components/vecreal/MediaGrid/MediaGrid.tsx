import { Card } from "../Card";
import { StatusBadge } from "../StatusBadge";
import { r, s, v } from "../componentInternals";

export interface MediaGridItem {
	id: string;
	label: string;
	src?: string;
	status?: "approved" | "pending" | "revision-requested" | "fresh";
	alt?: string;
}

export interface MediaGridProps {
	items: MediaGridItem[];
	columns?: 2 | 3 | 4;
	label?: string;
}

export function MediaGrid({ items, columns = 2, label = "Media grid" }: MediaGridProps) {
	return (
		<div aria-label={label} data-vecreal-component="MediaGrid" style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: s.px6 }}>
			{items.map((item) => (
				<Card key={item.id} variant="compact">
					<div
						role="img"
						aria-label={item.alt ?? item.label}
						style={{
							aspectRatio: "16 / 10",
							borderRadius: r.sm,
							background: item.src ? `var(--media-thumb-bg, ${v.bgSoft})` : v.bgSoft,
							border: `${v.borderWidth} solid ${v.border}`,
							display: "grid",
							placeItems: "center",
							color: v.muted,
							fontSize: s.px6,
						}}
					>
						{item.src ? <img src={item.src} alt={item.alt ?? item.label} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: r.sm }} /> : "Preview"}
					</div>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: s.px4 }}>
						<strong style={{ fontSize: s.px7 }}>{item.label}</strong>
						<StatusBadge variant={item.status === "approved" ? "success" : item.status === "revision-requested" ? "error" : item.status === "pending" ? "warning" : "neutral"} size="sm">
							{item.status ?? "fresh"}
						</StatusBadge>
					</div>
				</Card>
			))}
		</div>
	);
}
