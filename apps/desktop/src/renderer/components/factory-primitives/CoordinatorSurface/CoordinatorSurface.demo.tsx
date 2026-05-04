import { RightRailContextPanel } from "../RightRailContextPanel";
import { CoordinatorSurface } from "./CoordinatorSurface";

const context = {
	projectId: "software-factory",
	coordinatorRole: "PROJECT_COORDINATOR" as const,
	activeMode: "general" as const,
	activeDialogueId: "dialogue-c26-2",
	historyPath: "runs/dialogues/software-factory/coordinator/",
	currentReferences: [],
	rightRail: {
		projectId: "software-factory",
		coordinatorRole: "PROJECT_COORDINATOR" as const,
		collapsed: false,
		persistsAcrossModes: true as const,
		items: [],
	},
};

export function CoordinatorSurfaceDemo() {
	return (
		<div style={{ height: "calc(var(--sp-14) * 6)" }}>
			<CoordinatorSurface
				context={context}
				turns={[
					{
						turnId: "turn-1",
						surfaceId: "project-coordinator",
						dialogueId: "dialogue-c26-2",
						role: "agent",
						author: "agent",
						agentRole: "PROJECT_COORDINATOR",
						text: "WO-C26.2 implementation is ready for validation.",
						timestamp: "2026-05-04T16:00:00Z",
					},
					{
						turnId: "turn-2",
						surfaceId: "project-coordinator",
						dialogueId: "dialogue-c26-2",
						role: "operator",
						author: "yuriy",
						text: "surface it in the rail",
						timestamp: "2026-05-04T16:02:00Z",
					},
				]}
				rightRail={<RightRailContextPanel state={context.rightRail} />}
			/>
		</div>
	);
}
