import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/dialogues/",
)({
	component: DialoguesRedirect,
});

function DialoguesRedirect() {
	return <Navigate to="/factory/synthesis-receipts" replace />;
}
