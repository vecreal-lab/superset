import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/projects/$projectId/",
)({
	component: ProjectCoordinatorRedirect,
});

function ProjectCoordinatorRedirect() {
	return <Navigate to="/factory" replace />;
}
