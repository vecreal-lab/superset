import { PipelineStrip } from "./PipelineStrip";

const stages = [
	{ stageId: "scope", role: "PRODUCT_SCOPE", label: "Scope", hasOwnerGate: false, isParallelizable: false },
	{ stageId: "uiux", role: "UIUX_SCOPE", label: "UIUX", hasOwnerGate: true, isParallelizable: false },
	{ stageId: "arch", role: "ARCHITECTURE", label: "Arch", hasOwnerGate: false, isParallelizable: false },
	{ stageId: "impl", role: "IMPLEMENTATION", label: "Impl", hasOwnerGate: false, isParallelizable: false },
	{ stageId: "audit", role: "AUDIT", label: "Audit", hasOwnerGate: false, isParallelizable: false },
];

export function PipelineStripDemo() {
	return <PipelineStrip stages={stages} currentStageId="impl" />;
}
