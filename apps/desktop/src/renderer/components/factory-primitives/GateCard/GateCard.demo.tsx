import { GateCard } from "./GateCard";

const request = {
	gateId: "gate-c26-2",
	runId: "wo-c26.2",
	stageId: "implementation",
	type: "mockup_approval" as const,
	prompt: "WO-C26.2 shell approval",
	context: "Shell and primitive implementation is ready for review.",
	choices: [
		{ kind: "approve" as const, label: "Approve" },
		{ kind: "revise" as const, label: "Revise", promptForGuidance: true as const },
		{ kind: "escalate" as const, label: "Details" },
	],
	createdAt: "2026-05-04T16:00:00Z",
};

export function GateCardDemo() {
	return <GateCard request={request} variant="mockup" />;
}
