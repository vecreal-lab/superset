import { MergePacket } from "./MergePacket";

export function MergePacketDemo() {
	return (
		<MergePacket
			packet={{
				runId: "run-c26-2",
				workOrderId: "WO-C26.2",
				summary: "Shell primitives, workspace store, and graph-shaped contracts are ready.",
				filesChanged: [
					{ path: "factory-operator-console.ts", additions: 240, deletions: 0 },
					{ path: "factory-primitives/", additions: 1200, deletions: 0 },
				],
				verificationOutputs: [
					{ command: "bun run typecheck", status: "pass" },
				],
				lessonCandidates: [],
				domainKnowledgeRetrievalEvidence: {
					areasConsulted: ["operator-experience", "factory-architecture"],
					filesLoaded: [],
					tokenCountConsumed: 0,
					retrievalGaps: [],
				},
				auditFindings: [],
				decisionsRecorded: [],
				branchName: "factory/wo-c26.2",
				submoduleChanged: true,
			}}
		/>
	);
}
