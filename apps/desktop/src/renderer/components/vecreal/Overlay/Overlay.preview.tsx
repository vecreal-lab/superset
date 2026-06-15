import { Overlay } from "./Overlay";

export function OverlayPreview() {
	return (
		<div style={{ display: "grid", gap: "var(--sp-6)", padding: "var(--sp-8)", background: "var(--bg-app)", color: "var(--text-primary)" }}>
			<Overlay kind="modal" title="Preview" trigger={<button type="button">Open</button>} defaultOpen>Body</Overlay>
		</div>
	);
}

export default OverlayPreview;
