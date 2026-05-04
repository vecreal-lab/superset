import { EntityMentionLink } from "./EntityMentionLink";

export function EntityMentionLinkDemo() {
	return (
		<p>
			Open{" "}
			<EntityMentionLink
				reference={{
					referenceId: "WO-C26.2",
					kind: "work_order",
					label: "WO-C26.2",
					route: "/factory/work-orders/WO-C26.2",
				}}
			/>
			{" "}in the right rail.
		</p>
	);
}
