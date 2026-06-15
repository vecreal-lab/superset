import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	RouteErrorBoundaryFallback,
	sanitizeRouteErrorMessage,
	type RouteErrorReport,
} from "./RouteErrorBoundary";

describe("RouteErrorBoundary", () => {
	test("sanitizes route error messages for operator display", () => {
		expect(sanitizeRouteErrorMessage(new Error("  broken\n\nroute  "))).toBe(
			"broken route",
		);
	});

	test("renders route, message, and recovery actions", () => {
		const report: RouteErrorReport = {
			routePath: "/factory/projects/software-factory",
			message: "Not allowed to load local resource",
			stack: "Error: Not allowed",
			reportedAt: "2026-05-05T00:00:00.000Z",
		};
		const html = renderToStaticMarkup(
			<RouteErrorBoundaryFallback
				report={report}
				showStack
				onRefresh={() => undefined}
				onReport={() => undefined}
			/>,
		);

		expect(html).toContain('data-route-error-boundary="true"');
		expect(html).toContain("/factory/projects/software-factory");
		expect(html).toContain("Not allowed to load local resource");
		expect(html).toContain("Refresh route");
		expect(html).toContain("Report issue");
	});
});
