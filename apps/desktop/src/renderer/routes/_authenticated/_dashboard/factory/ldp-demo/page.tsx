import { createFileRoute } from "@tanstack/react-router";
import { LDPDemoHarness } from "../components/LDPDemoHarness";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/ldp-demo/",
)({
	component: LDPDemoPage,
});

function LDPDemoPage() {
	return <LDPDemoHarness />;
}
