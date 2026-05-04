import { StaleStateNotice } from "./StaleStateNotice";

export function StaleStateNoticeDemo() {
	return (
		<StaleStateNotice
			notice={{
				surface: "/factory/foundations/software-factory/mission",
				lastSeenAt: "2026-05-04T12:00:00Z",
				upstreamCommit: "e78d401",
				changedAt: "2026-05-04T12:20:00Z",
				changeSummary: "Mission wording changed while this dialogue was open.",
				affectsCurrentDialogue: true,
			}}
			onAcknowledge={() => undefined}
			onContinueAgainstNewState={() => undefined}
		/>
	);
}
