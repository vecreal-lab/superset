import { MockupRenderer } from "./MockupRenderer";

export function MockupRendererDemo() {
	return (
		<MockupRenderer
			mockup={{
				path: "mockups/gate-2-html/screenshot-dark.png",
				index: 1,
				caption: "Dark mode shell",
				generatedAt: "2026-05-04T16:00:00Z",
			}}
			onApprove={() => undefined}
			onRequestRevision={() => undefined}
		/>
	);
}
