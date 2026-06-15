import {
	createFileRoute,
	Navigate,
	Outlet,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { env } from "renderer/env.renderer";

export const Route = createFileRoute("/_authenticated/_dashboard/automations")({
	beforeLoad: () => {
		if (env.FACTORY_LOCAL_ONLY === "true") {
			throw redirect({ to: "/v2-workspaces", replace: true });
		}
	},
	component: AutomationsLayout,
});

function AutomationsLayout() {
	const navigate = useNavigate();
	const { hasAccess, gateFeature } = usePaywall();
	const allowed = hasAccess(GATED_FEATURES.AUTOMATIONS);
	const factoryLocalOnly = env.FACTORY_LOCAL_ONLY === "true";
	const handledRef = useRef(false);

	useEffect(() => {
		if (factoryLocalOnly || allowed || handledRef.current) return;
		handledRef.current = true;
		gateFeature(GATED_FEATURES.AUTOMATIONS, () => {});
		navigate({ to: "/v2-workspaces", replace: true });
	}, [allowed, factoryLocalOnly, gateFeature, navigate]);

	if (factoryLocalOnly) {
		return <Navigate to="/v2-workspaces" replace />;
	}

	if (!allowed) return null;
	return <Outlet />;
}
