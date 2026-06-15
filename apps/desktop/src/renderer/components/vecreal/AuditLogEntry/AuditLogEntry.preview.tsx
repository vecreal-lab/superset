import { AuditLogEntry } from "./AuditLogEntry";

export function AuditLogEntryPreview() {
	return (
		<div style={{ display: "grid", gap: "var(--sp-6)", padding: "var(--sp-8)", background: "var(--bg-app)", color: "var(--text-primary)" }}>
			<AuditLogEntry title="Audit passed" source="AUDIT" time="2026-05-05T12:00:00.000Z">Clean</AuditLogEntry>
		</div>
	);
}

export default AuditLogEntryPreview;
