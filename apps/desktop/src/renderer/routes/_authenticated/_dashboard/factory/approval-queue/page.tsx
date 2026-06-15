import { createFileRoute } from "@tanstack/react-router";
import { ApprovalQueueContent } from "../approvals/page";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/approval-queue/",
)({
	validateSearch: (search) => ({
		dialogueId:
			typeof search.dialogueId === "string" ? search.dialogueId : undefined,
	}),
	component: ApprovalQueuePage,
});

function ApprovalQueuePage() {
	const search = Route.useSearch();
	return <ApprovalQueueContent search={search} navigateTo="/factory/approval-queue" />;
}
