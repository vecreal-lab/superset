import { RightRailContextPanel } from "./RightRailContextPanel";

const author = {
	user: "agent",
	role: "PROJECT_COORDINATOR",
	isAgent: true,
	displayName: "Project Coordinator",
};

export function RightRailContextPanelDemo() {
	return (
		<div style={{ height: "calc(var(--sp-14) * 5)" }}>
			<RightRailContextPanel
				state={{
					projectId: "software-factory",
					coordinatorRole: "PROJECT_COORDINATOR",
					collapsed: false,
					persistsAcrossModes: true,
					items: [
						{
							itemId: "gate-c26",
							kind: "pending_action",
							title: "WO-C26.2 approval",
							summary: "Implementation receipt is ready.",
							priority: "interrupting",
							updatedAt: "2026-05-04T16:00:00Z",
							expanded: true,
							references: [],
							gate: {
								gateId: "gate-c26",
								runId: "wo-c26.2",
								stageId: "audit",
								type: "final_acceptance",
								prompt: "Approve WO-C26.2?",
								context: "Shell primitives are ready.",
								choices: [{ kind: "approve", label: "Approve" }],
								createdAt: "2026-05-04T16:00:00Z",
							},
						},
						{
							itemId: "handoff-uiux",
							kind: "handoff",
							title: "UIUX validation handoff",
							summary: "Gate 3 validator pass queued.",
							priority: "proactive",
							updatedAt: "2026-05-04T16:00:00Z",
							expanded: true,
							references: [],
							handoff: {
								handoffId: "handoff-uiux",
								kind: "pc_to_uiux",
								status: "pending_operator",
								from: { projectId: "software-factory", coordinatorRole: "PROJECT_COORDINATOR", dialoguePath: "runs/dialogues/software-factory/coordinator/" },
								to: { projectId: "software-factory", coordinatorRole: "UIUX_COORDINATOR", dialoguePath: "runs/dialogues/software-factory/uiux-coordinator/" },
								createdBy: author,
								createdAt: "2026-05-04T16:00:00Z",
								summary: "Validate shell primitives.",
								requestedAction: "Run the WO-C31 Gate 3 checklist.",
								references: [],
							},
						},
					],
				}}
			/>
		</div>
	);
}
