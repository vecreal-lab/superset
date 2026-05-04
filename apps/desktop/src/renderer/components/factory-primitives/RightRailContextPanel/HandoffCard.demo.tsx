import { HandoffCard } from "./HandoffCard";

const author = {
	user: "agent",
	role: "PROJECT_COORDINATOR",
	isAgent: true,
	displayName: "Project Coordinator",
};

export function HandoffCardDemo() {
	return (
		<HandoffCard
			handoff={{
				handoffId: "handoff-uiux-c26",
				kind: "pc_to_uiux",
				status: "pending_operator",
				from: {
					projectId: "software-factory",
					coordinatorRole: "PROJECT_COORDINATOR",
					dialoguePath: "runs/dialogues/software-factory/coordinator/",
				},
				to: {
					projectId: "software-factory",
					coordinatorRole: "UIUX_COORDINATOR",
					dialoguePath: "runs/dialogues/software-factory/uiux-coordinator/",
				},
				createdBy: author,
				createdAt: "2026-05-04T16:00:00Z",
				summary: "UIUX Coordinator should validate this surface.",
				requestedAction: "Run Gate 3 validation against the approved HTML.",
				references: [],
			}}
		/>
	);
}
