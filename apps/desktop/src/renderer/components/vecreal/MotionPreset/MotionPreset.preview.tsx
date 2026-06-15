import { MotionPreset } from "./MotionPreset";

export function MotionPresetPreview() {
	return (
		<div
			style={{
				display: "grid",
				gap: "var(--sp-6)",
				maxWidth: "calc(var(--sp-14) * 5)",
			}}
		>
			<MotionPreset preset="entry">
				<div className="factory-card">Entry preset</div>
			</MotionPreset>
			<MotionPreset preset="pulse" active>
				<div className="factory-chip factory-chip--attention">Pulse preset</div>
			</MotionPreset>
			<MotionPreset preset="re-anchor" layout>
				<div className="factory-card">Re-anchor preset</div>
			</MotionPreset>
		</div>
	);
}
