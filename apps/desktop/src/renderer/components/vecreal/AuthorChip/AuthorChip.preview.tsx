import { AuthorChip } from "./AuthorChip";

export function AuthorChipPreview() {
	return (
		<div
			style={{
				display: "grid",
				gap: "var(--sp-8)",
				alignContent: "start",
				color: "var(--text-primary)",
			}}
			data-vecreal-preview="AuthorChip"
		>
			<section style={{ display: "grid", gap: "var(--sp-4)" }}>
				<h3 style={sectionLabel}>Who produced this</h3>
				<div style={wrapRow}>
					<AuthorChip name="Yuriy Levytsky" kind="human" />
					<AuthorChip name="ORCH" kind="agent" />
					<AuthorChip name="Project Coordinator" kind="agent" role="PC" showRole />
					<AuthorChip name="Vecreal" kind="project" />
					<AuthorChip name="Factory System" kind="system" />
				</div>
			</section>
			<section style={{ display: "grid", gap: "var(--sp-4)" }}>
				<h3 style={sectionLabel}>Sizes and truncation</h3>
				<div style={wrapRow}>
					<AuthorChip name="AS" kind="human" size="sm" />
					<AuthorChip name="Maria Rodriguez" kind="human" size="md" />
					<AuthorChip
						name="A very long contributor display name"
						kind="human"
						maxWidth={220}
					/>
				</div>
			</section>
		</div>
	);
}

export default AuthorChipPreview;

const wrapRow = {
	display: "flex",
	flexWrap: "wrap",
	gap: "var(--sp-3)",
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
