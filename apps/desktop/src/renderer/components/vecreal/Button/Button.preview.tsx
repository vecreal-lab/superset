import { Button } from "./Button";

export function ButtonPreview() {
	return (
		<div style={{ display: "grid", gap: "var(--sp-6)", padding: "var(--sp-8)", background: "var(--bg-app)", color: "var(--text-primary)" }}>
			<Button variant="primary">Continue</Button>
		</div>
	);
}

export default ButtonPreview;
