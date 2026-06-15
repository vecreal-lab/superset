import { IconButton } from "./IconButton";

export function IconButtonPreview() {
	return (
		<div style={{ display: "grid", gap: "var(--sp-6)", padding: "var(--sp-8)", background: "var(--bg-app)", color: "var(--text-primary)" }}>
			<IconButton label="Open tools">+</IconButton>
		</div>
	);
}

export default IconButtonPreview;
