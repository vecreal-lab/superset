import { ResearchAttachmentDropZone } from "./ResearchAttachmentDropZone";

export function ResearchAttachmentDropZoneDemo() {
	return (
		<ResearchAttachmentDropZone
			references={[
				{
					referenceId: "intake-2026-05-04",
					kind: "intake",
					label: "Research intake packet",
					route: "/factory/intake/2026-05-04",
				},
			]}
		/>
	);
}
