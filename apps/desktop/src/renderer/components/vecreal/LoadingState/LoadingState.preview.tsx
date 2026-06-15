import { LoadingState } from "./LoadingState";

export function LoadingStatePreview() {
	return (
		<div style={{ display: "grid", gap: "var(--sp-6)", padding: "var(--sp-8)", background: "var(--bg-app)", color: "var(--text-primary)" }}>
			<LoadingState label="Loading runs" variant="panel" />
		</div>
	);
}

export default LoadingStatePreview;
