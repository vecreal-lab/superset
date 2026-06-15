import { ErrorState } from "./ErrorState";

export function ErrorStatePreview() {
	return (
		<div style={{ display: "grid", gap: "var(--sp-6)", padding: "var(--sp-8)", background: "var(--bg-app)", color: "var(--text-primary)" }}>
			<ErrorState title="Could not load" message="Try again after the run finishes." />
		</div>
	);
}

export default ErrorStatePreview;
