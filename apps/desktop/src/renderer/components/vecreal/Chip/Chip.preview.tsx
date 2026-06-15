import { Chip } from "./Chip";

const tones = ["neutral", "clay", "success", "warning", "error", "info"] as const;
const sizes = ["xs", "sm", "md"] as const;

export function ChipPreview() {
	return (
		<div
			style={{
				display: "grid",
				gap: "var(--sp-8)",
				alignContent: "start",
				color: "var(--text-primary)",
			}}
			data-vecreal-preview="Chip"
		>
			<section style={{ display: "grid", gap: "var(--sp-4)" }}>
				<h3 style={sectionLabel}>Filter states</h3>
				<div style={wrapRow}>
					{tones.map((tone) => (
						<Chip key={`chip-${tone}`} tone={tone}>
							{tone}
						</Chip>
					))}
				</div>
				<div style={wrapRow}>
					{tones.map((tone) => (
						<Chip key={`chip-selected-${tone}`} tone={tone} selected>
							{tone}
						</Chip>
					))}
				</div>
			</section>

			<section style={{ display: "grid", gap: "var(--sp-4)" }}>
				<h3 style={sectionLabel}>Removable and avatar</h3>
				<div style={wrapRow}>
					<Chip tone="clay" selected onRemove={() => undefined}>
						Status: Open
					</Chip>
					<Chip tone="warning" selected onRemove={() => undefined}>
						Priority: High
					</Chip>
					<Chip avatarInitials="AS">Aaron Schmidt</Chip>
					<Chip avatarInitials="MR">Maria Rodriguez</Chip>
				</div>
			</section>

			<section style={{ display: "grid", gap: "var(--sp-4)" }}>
				<h3 style={sectionLabel}>Sizes</h3>
				<div style={wrapRow}>
					{sizes.map((size) => (
						<Chip key={`chip-size-${size}`} size={size} tone="clay" selected>
							{size}
						</Chip>
					))}
				</div>
			</section>
		</div>
	);
}

export default ChipPreview;

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
