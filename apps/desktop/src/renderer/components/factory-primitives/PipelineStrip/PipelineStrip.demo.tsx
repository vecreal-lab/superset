import { PipelineStrip, type PipelineStage } from ".";

const stages: PipelineStage[] = [
	{ id: "scope", label: "Scope", state: "complete" },
	{ id: "uiux", label: "UIUX", state: "complete" },
	{ id: "arch", label: "Arch", state: "complete" },
	{ id: "impl", label: "Impl", state: "active" },
	{ id: "audit", label: "Audit", state: "pending" },
];

export function PipelineStripDemo() {
	return <PipelineStrip stages={stages} />;
}
