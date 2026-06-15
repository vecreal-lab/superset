import { RouteErrorBoundaryFallback, type RouteErrorReport } from "./RouteErrorBoundary";

const previewReport: RouteErrorReport = {
	routePath: "/factory/projects/software-factory",
	message: "Example route render failure captured by RouteErrorBoundary.",
	stack: "Error: Example route render failure",
	reportedAt: "2026-05-05T00:00:00.000Z",
};

export function RouteErrorBoundaryPreview() {
	return (
		<RouteErrorBoundaryFallback
			report={previewReport}
			showStack
			onRefresh={() => undefined}
			onReport={() => undefined}
		/>
	);
}
