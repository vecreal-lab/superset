import { createFileRoute } from "@tanstack/react-router";

import { DesignSystemSurface } from "renderer/components/DesignSystemSurface";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/design-system/",
)({
	component: DesignSystemPage,
});

function DesignSystemPage() {
	return <DesignSystemSurface />;
}
