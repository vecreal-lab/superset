import { FileCard } from "./FileCard";

export function FileCardPreview() {
	return (
		<div style={{ display: "grid", gap: "var(--sp-6)", padding: "var(--sp-8)", background: "var(--bg-app)", color: "var(--text-primary)" }}>
			<FileCard name="receipt.md" type="receipt" status="ready" meta="2 KB" />
		</div>
	);
}

export default FileCardPreview;
