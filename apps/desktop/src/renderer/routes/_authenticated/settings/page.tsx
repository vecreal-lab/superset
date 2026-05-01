import { createFileRoute, Navigate } from "@tanstack/react-router";
import { env } from "renderer/env.renderer";

export const Route = createFileRoute("/_authenticated/settings/")({
	component: SettingsPage,
});

function SettingsPage() {
	if (env.FACTORY_LOCAL_ONLY === "true") {
		return <Navigate to="/settings/appearance" replace />;
	}
	return <Navigate to="/settings/account" replace />;
}
