import { AuthorChip } from ".";

export function AuthorChipDemo() {
	return (
		<div style={{ display: "flex", gap: "var(--sp-6)", alignItems: "center" }}>
			<AuthorChip name="Yuriy" kind="human" />
			<AuthorChip name="Project Coordinator" kind="agent" role="PC" showRole size="md" />
		</div>
	);
}
