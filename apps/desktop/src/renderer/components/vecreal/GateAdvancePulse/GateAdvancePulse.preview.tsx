import { Check } from "lucide-react";
import { GateAdvancePulse } from "./GateAdvancePulse";

export function GateAdvancePulsePreview() {
	return (
		<div style={{ display: "flex", gap: "var(--sp-7)", alignItems: "center" }}>
			<GateAdvancePulse state="done" label="Scope" pulseOnMount>
				<span className="factory-chip factory-chip--success">
					<Check size={14} aria-hidden="true" />
					Scope
				</span>
			</GateAdvancePulse>
			<GateAdvancePulse state="active" label="Build">
				<span className="factory-chip factory-chip--attention">Build</span>
			</GateAdvancePulse>
			<GateAdvancePulse state="pending" label="Audit">
				<span className="factory-chip">Audit</span>
			</GateAdvancePulse>
		</div>
	);
}
