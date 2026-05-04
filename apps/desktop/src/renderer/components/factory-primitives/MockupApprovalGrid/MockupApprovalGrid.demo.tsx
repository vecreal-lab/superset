import { MockupApprovalGrid } from "./MockupApprovalGrid";

export function MockupApprovalGridDemo() {
	return (
		<MockupApprovalGrid
			bundle={{
				bundleId: "bundle-c26-2",
				runId: "wo-c26.2",
				stageId: "gate-2",
				approvalState: "pending",
				revisionCount: 1,
				mockups: [
					{ path: "dark.png", index: 1, generatedAt: "2026-05-04T16:00:00Z" },
					{ path: "light.png", index: 2, generatedAt: "2026-05-04T16:00:00Z" },
				],
			}}
			onBundleApprove={() => undefined}
			onMockupRevise={() => undefined}
		/>
	);
}
