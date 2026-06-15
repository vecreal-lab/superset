import { StatusBadge, type StatusBadgeSize, type StatusBadgeVariant } from "./StatusBadge";

const variants: StatusBadgeVariant[] = ["success", "warning", "error", "info", "neutral"];
const sizes: StatusBadgeSize[] = ["sm", "md"];

const labels: Record<StatusBadgeVariant, string> = {
	success: "Complete",
	warning: "Needs attention",
	error: "Blocked",
	info: "Running",
	neutral: "Queued",
};

export function StatusBadgePreview() {
	return (
		<div
			style={{
				display: "grid",
				gap: "var(--sp-6)",
				alignContent: "start",
			}}
			data-vecreal-preview="StatusBadge"
		>
			{sizes.map((size) => (
				<section key={size} style={{ display: "grid", gap: "var(--sp-4)" }}>
					<h3
						style={{
							margin: 0,
							fontSize: "var(--sp-6)",
							fontFamily: "var(--font-mono)",
							color: "var(--text-tertiary)",
							textTransform: "uppercase",
						}}
					>
						{size}
					</h3>
					<div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-4)" }}>
						{variants.map((variant) => (
							<StatusBadge
								key={`${size}-${variant}`}
								variant={variant}
								size={size}
								isLive={variant === "info"}
							>
								{labels[variant]}
							</StatusBadge>
						))}
					</div>
				</section>
			))}
		</div>
	);
}
