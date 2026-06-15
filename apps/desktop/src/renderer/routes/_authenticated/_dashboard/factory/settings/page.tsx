import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { AuthorChip, Button, Card, StatusBadge } from "renderer/components/vecreal";
import { electronTrpc } from "renderer/lib/electron-trpc";

export const Route = createFileRoute("/_authenticated/_dashboard/factory/settings/")({
	component: FactorySettingsPage,
});

const pageStyle: CSSProperties = {
	display: "flex",
	minWidth: 0,
	height: "100%",
	flexDirection: "column",
	overflow: "hidden",
};

const scrollStyle: CSSProperties = {
	minWidth: 0,
	flex: 1,
	overflowY: "auto",
	padding: "var(--sp-10)",
};

const stackStyle: CSSProperties = {
	display: "grid",
	gap: "var(--sp-6)",
	minWidth: 0,
};

const gridStyle: CSSProperties = {
	display: "grid",
	gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
	gap: "var(--sp-8)",
	minWidth: 0,
	alignItems: "start",
};

const metaStyle: CSSProperties = {
	color: "var(--text-dark-muted)",
	fontSize: "12px",
	lineHeight: 1.5,
};

const valueStyle: CSSProperties = {
	color: "var(--text-dark-body)",
	fontFamily: "var(--font-mono)",
	fontSize: "12px",
	lineHeight: 1.5,
	overflowWrap: "anywhere",
};

const codeStyle: CSSProperties = {
	margin: 0,
	maxWidth: "100%",
	overflowX: "auto",
	borderRadius: "var(--r-5)",
	border: "1px solid var(--border-dark)",
	background: "var(--bg-app-dark)",
	color: "var(--text-dark-body)",
	padding: "var(--sp-8)",
	fontFamily: "var(--font-mono)",
	fontSize: "12px",
	lineHeight: 1.55,
};

function DiagnosticRow({ label, value }: { label: string; value: string | number | boolean }) {
	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: "minmax(9rem, 0.28fr) minmax(0, 1fr)",
				gap: "var(--sp-4)",
				minWidth: 0,
				alignItems: "start",
			}}
		>
			<span style={metaStyle}>{label}</span>
			<span style={valueStyle}>{String(value)}</span>
		</div>
	);
}

function FactorySettingsPage() {
	const profileQuery = electronTrpc.factory.settings.getOperatorProfile.useQuery();
	const diagnosticsQuery = electronTrpc.factory.settings.getDiagnostics.useQuery();
	const toggleTheme = electronTrpc.factory.settings.toggleTheme.useMutation();
	const runBootSmoke = electronTrpc.factory.settings.runBootSmoke.useMutation();
	const [theme, setTheme] = useState<"dark" | "light">("dark");

	useEffect(() => {
		const detected = document.documentElement.dataset.theme === "light" ? "light" : "dark";
		setTheme(detected);
	}, []);

	const nextTheme = theme === "dark" ? "light" : "dark";
	const diagnostics = diagnosticsQuery.data;
	const profile = profileQuery.data;
	const smokeOutput = useMemo(() => {
		if (!runBootSmoke.data) return "";
		const stderr = runBootSmoke.data.stderr ? `\nSTDERR\n${runBootSmoke.data.stderr}` : "";
		return `${runBootSmoke.data.stdout}${stderr}`.trim();
	}, [runBootSmoke.data]);

	const applyTheme = () => {
		setTheme(nextTheme);
		document.documentElement.dataset.theme = nextTheme;
		document.documentElement.style.colorScheme = nextTheme;
		toggleTheme.mutate({ theme: nextTheme });
	};

	return (
		<div style={pageStyle}>
			<div style={scrollStyle}>
				<div style={stackStyle}>
					<header style={{ ...stackStyle, gap: "var(--sp-4)" }}>
						<div style={{ display: "flex", gap: "var(--sp-4)", flexWrap: "wrap" }}>
							<StatusBadge variant="info">Operator config</StatusBadge>
							<StatusBadge variant={diagnostics?.factoryLocalOnly ? "success" : "warning"}>
								FACTORY_LOCAL_ONLY {diagnostics?.factoryLocalOnly ? "on" : "off"}
							</StatusBadge>
						</div>
						<h1 style={{ margin: 0, color: "var(--text-dark-primary)", fontSize: "28px" }}>
							Settings
						</h1>
						<p style={{ ...metaStyle, maxWidth: "70ch" }}>
							Local cockpit configuration, operator identity, version information, and
							diagnostic smoke entry points.
						</p>
					</header>

					<div style={gridStyle}>
						<div style={stackStyle}>
							<Card variant="default" style={stackStyle}>
								<strong style={{ color: "var(--text-dark-primary)" }}>Operator profile</strong>
								{profile ? (
									<AuthorChip name={profile.name} role={profile.role} showRole size="md" maxWidth={320} />
								) : (
									<p style={metaStyle}>Loading operator profile...</p>
								)}
								<Button variant="secondary" onClick={applyTheme}>
									Switch to {nextTheme} theme
								</Button>
							</Card>

							<Card variant="default" style={stackStyle}>
								<div style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-4)", flexWrap: "wrap" }}>
									<strong style={{ color: "var(--text-dark-primary)" }}>
										Cockpit boot harness
									</strong>
									{runBootSmoke.data ? (
										<StatusBadge variant={runBootSmoke.data.status === "pass" ? "success" : "error"}>
											{runBootSmoke.data.status}
										</StatusBadge>
									) : null}
								</div>
								<p style={metaStyle}>
									Run the extended boot smoke from the operator workspace and display the
									latest result path.
								</p>
								<Button
									variant="clay"
									loading={runBootSmoke.isPending}
									onClick={() => runBootSmoke.mutate()}
								>
									Run boot smoke
								</Button>
								{runBootSmoke.data ? (
									<>
										<DiagnosticRow label="results.json" value={runBootSmoke.data.resultsPath} />
										<DiagnosticRow label="exit code" value={runBootSmoke.data.exitCode ?? "timed out"} />
									</>
								) : null}
								{runBootSmoke.error ? (
									<p style={{ ...metaStyle, color: "var(--error)" }}>
										{runBootSmoke.error.message}
									</p>
								) : null}
								{smokeOutput ? <pre style={codeStyle}>{smokeOutput}</pre> : null}
							</Card>
						</div>

						<Card variant="default" style={stackStyle}>
							<strong style={{ color: "var(--text-dark-primary)" }}>Diagnostics</strong>
							{diagnosticsQuery.isLoading ? (
								<p style={metaStyle}>Loading diagnostics...</p>
							) : diagnostics ? (
								<div style={{ display: "grid", gap: "var(--sp-4)", minWidth: 0 }}>
									<DiagnosticRow label="app" value={diagnostics.appName} />
									<DiagnosticRow label="version" value={diagnostics.version} />
									<DiagnosticRow label="factory root" value={diagnostics.factoryRoot} />
									<DiagnosticRow label="local only" value={diagnostics.factoryLocalOnly} />
									<DiagnosticRow label="Electron" value={diagnostics.electronVersion} />
									<DiagnosticRow label="Chromium" value={diagnostics.chromeVersion} />
									<DiagnosticRow label="Node" value={diagnostics.nodeVersion} />
									<DiagnosticRow label="Bun" value={diagnostics.bunVersion} />
									<DiagnosticRow label="platform" value={`${diagnostics.platform}/${diagnostics.arch}`} />
								</div>
							) : (
								<p style={metaStyle}>Diagnostics are unavailable.</p>
							)}
						</Card>
					</div>
				</div>
			</div>
		</div>
	);
}
