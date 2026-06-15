import { AttentionPill } from "./AttentionPill";

export function AttentionPillPreview() {
	return (
		<div
			style={{
				display: "grid",
				gap: "var(--sp-8)",
				alignContent: "start",
				color: "var(--text-primary)",
			}}
			data-vecreal-preview="AttentionPill"
		>
			<section style={{ display: "grid", gap: "var(--sp-4)" }}>
				<h3 style={sectionLabel}>Count badges</h3>
				<div style={wrapRow}>
					<AttentionPill count={1} />
					<AttentionPill count={5} />
					<AttentionPill count="12+" />
					<AttentionPill count={104} />
				</div>
			</section>
			<section style={{ display: "grid", gap: "var(--sp-4)" }}>
				<h3 style={sectionLabel}>Attention states</h3>
				<div style={wrapRow}>
					<AttentionPill count={3} variant="attention" isLive />
					<AttentionPill count={2} variant="warning" />
					<AttentionPill count={1} variant="blocker" />
					<AttentionPill count={7} variant="info" />
				</div>
			</section>
			<section style={{ display: "grid", gap: "var(--sp-4)" }}>
				<h3 style={sectionLabel}>With context text</h3>
				<div style={wrapRow}>
					<AttentionPill count={5} variant="attention">
						Needs reply
					</AttentionPill>
					<AttentionPill count={1} variant="blocker" size="md">
						Blocked
					</AttentionPill>
				</div>
			</section>
		</div>
	);
}

export default AttentionPillPreview;

const wrapRow = {
	display: "flex",
	flexWrap: "wrap",
	gap: "var(--sp-4)",
	alignItems: "center",
} as const;

const sectionLabel = {
	margin: 0,
	fontSize: "var(--sp-5)",
	fontFamily: "var(--font-mono)",
	color: "var(--text-tertiary)",
	textTransform: "uppercase",
	letterSpacing: "0.14em",
} as const;
