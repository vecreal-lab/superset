import { ChatTurnEntry } from "./ChatTurnEntry";

export function ChatTurnEntryPreview() {
	return (
		<div style={{ display: "grid", gap: "var(--sp-5)" }}>
			<ChatTurnEntry turnId="preview-agent" role="agent">
				<div className="factory-card">PROJECT_COORDINATOR has a new update.</div>
			</ChatTurnEntry>
			<ChatTurnEntry turnId="preview-operator" role="operator">
				<div className="factory-card">Operator reply enters without shifting layout.</div>
			</ChatTurnEntry>
		</div>
	);
}
