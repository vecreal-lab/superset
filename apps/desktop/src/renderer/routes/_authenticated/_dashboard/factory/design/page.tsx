import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { MarkdownRenderer } from "renderer/components/MarkdownRenderer/MarkdownRenderer";
import { Button, Card, StatusBadge } from "renderer/components/vecreal";
import { electronTrpc } from "renderer/lib/electron-trpc";

export const Route = createFileRoute("/_authenticated/_dashboard/factory/design/")({
	component: FactoryDesignPage,
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

const twoColumnStyle: CSSProperties = {
	display: "grid",
	gridTemplateColumns: "minmax(18rem, 0.34fr) minmax(0, 1fr)",
	gap: "var(--sp-8)",
	minWidth: 0,
	alignItems: "start",
};

const stackStyle: CSSProperties = {
	display: "grid",
	gap: "var(--sp-6)",
	minWidth: 0,
};

const metaStyle: CSSProperties = {
	color: "var(--text-dark-muted)",
	fontSize: "12px",
	lineHeight: 1.5,
};

const pathStyle: CSSProperties = {
	color: "var(--text-dark-muted)",
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

function severityVariant(severity: string) {
	if (severity === "blocker") return "error";
	if (severity === "warning") return "warning";
	return "info";
}

function kindVariant(kind: string) {
	if (kind === "html") return "warning";
	if (kind === "json") return "info";
	return "neutral";
}

function formatJson(content: string) {
	try {
		return JSON.stringify(JSON.parse(content), null, 2);
	} catch {
		return content;
	}
}

function FactoryDesignPage() {
	const [selectedPath, setSelectedPath] = useState("");
	const filesQuery = electronTrpc.factory.design.listBrandAtoms.useQuery();
	const gapsQuery = electronTrpc.factory.design.listKnownGaps.useQuery();
	const selectedQuery = electronTrpc.factory.design.readBrandAtom.useQuery(
		{ path: selectedPath },
		{ enabled: selectedPath.length > 0 },
	);

	const files = filesQuery.data ?? [];
	const knownGaps = gapsQuery.data ?? [];

	useEffect(() => {
		if (!selectedPath && files.length > 0) {
			const preferred =
				files.find((file) => file.path.endsWith("/principles.md")) ??
				files.find((file) => file.path.endsWith("/known-gaps.md")) ??
				files[0];
			setSelectedPath(preferred.path);
		}
	}, [files, selectedPath]);

	const selectedFile = selectedQuery.data;
	const counts = useMemo(
		() => ({
			markdown: files.filter((file) => file.kind === "markdown").length,
			json: files.filter((file) => file.kind === "json").length,
			html: files.filter((file) => file.kind === "html").length,
		}),
		[files],
	);

	return (
		<div style={pageStyle}>
			<div style={scrollStyle}>
				<div style={stackStyle}>
					<header style={{ ...stackStyle, gap: "var(--sp-4)" }}>
						<div style={{ display: "flex", gap: "var(--sp-4)", flexWrap: "wrap" }}>
							<StatusBadge variant="info">Path A read-only</StatusBadge>
							<StatusBadge variant="neutral">{files.length} files</StatusBadge>
							<StatusBadge variant="warning">{knownGaps.length} known gaps</StatusBadge>
						</div>
						<h1 style={{ margin: 0, color: "var(--text-dark-primary)", fontSize: "28px" }}>
							Design
						</h1>
						<p style={{ ...metaStyle, maxWidth: "72ch" }}>
							Brand atom workspace for reference review. The cockpit only displays Path A
							materials and never writes into the brand atom source tree.
						</p>
					</header>

					<div style={twoColumnStyle}>
						<div style={stackStyle}>
							<Card variant="compact" style={stackStyle}>
								<div style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-4)" }}>
									<strong style={{ color: "var(--text-dark-primary)" }}>Brand atoms</strong>
									<span style={metaStyle}>
										{counts.markdown} md / {counts.json} json / {counts.html} html
									</span>
								</div>
								<div style={{ display: "grid", gap: "var(--sp-3)", minWidth: 0 }}>
									{filesQuery.isLoading ? (
										<p style={metaStyle}>Loading brand atoms...</p>
									) : (
										files.map((file) => (
											<button
												key={file.path}
												type="button"
												onClick={() => setSelectedPath(file.path)}
												style={{
													display: "grid",
													gridTemplateColumns: "minmax(0, 1fr) auto",
													gap: "var(--sp-4)",
													alignItems: "center",
													minWidth: 0,
													border: "1px solid var(--border-dark)",
													borderRadius: "var(--r-4)",
													background:
														selectedPath === file.path
															? "var(--bg-pill-dark)"
															: "var(--bg-card-dark-bottom)",
													color: "var(--text-dark-body)",
													padding: "var(--sp-5) var(--sp-6)",
													textAlign: "left",
													cursor: "pointer",
												}}
											>
												<span style={{ minWidth: 0 }}>
													<span
														style={{
															display: "block",
															overflow: "hidden",
															textOverflow: "ellipsis",
															whiteSpace: "nowrap",
														}}
													>
														{file.label}
													</span>
													<span style={pathStyle}>{file.path}</span>
												</span>
												<StatusBadge variant={kindVariant(file.kind)}>{file.kind}</StatusBadge>
											</button>
										))
									)}
								</div>
							</Card>

							<Card variant="compact" style={stackStyle}>
								<strong style={{ color: "var(--text-dark-primary)" }}>Start Path A session</strong>
								<p style={metaStyle}>
									Use this page to inspect the locked references, then launch an operator-owned
									Path A pass before changing canonical atoms. Agent passes surface gaps only.
								</p>
								<Button variant="secondary" onClick={() => window.open("/factory/design-system", "_self")}>
									Open component design surface
								</Button>
							</Card>
						</div>

						<div style={stackStyle}>
							<Card variant="default" style={{ ...stackStyle, minWidth: 0 }}>
								<div style={{ display: "flex", gap: "var(--sp-4)", flexWrap: "wrap", alignItems: "center" }}>
									<strong style={{ color: "var(--text-dark-primary)" }}>
										{selectedFile?.label ?? "Select a brand atom"}
									</strong>
									{selectedFile ? (
										<StatusBadge variant={kindVariant(selectedFile.kind)}>
											{selectedFile.kind}
										</StatusBadge>
									) : null}
								</div>
								{selectedFile ? <span style={pathStyle}>{selectedFile.path}</span> : null}
								<div style={{ minWidth: 0, maxWidth: "100%" }}>
									{selectedQuery.isLoading ? (
										<p style={metaStyle}>Loading selected file...</p>
									) : selectedFile?.kind === "html" ? (
										<iframe
											title={selectedFile.label}
											src={selectedFile.factoryUrl}
											sandbox=""
											style={{
												width: "100%",
												height: "min(68vh, 760px)",
												border: "1px solid var(--border-dark)",
												borderRadius: "var(--r-5)",
												background: "var(--bg-card-light)",
											}}
										/>
									) : selectedFile?.kind === "json" ? (
										<pre style={codeStyle}>{formatJson(selectedFile.content)}</pre>
									) : selectedFile ? (
										<div style={{ maxWidth: "100%", overflowX: "auto" }}>
											<MarkdownRenderer content={selectedFile.content} className="h-auto min-w-0" />
										</div>
									) : (
										<p style={metaStyle}>Pick a file from the brand atom tree.</p>
									)}
								</div>
							</Card>

							<Card variant="compact" style={stackStyle}>
								<div style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-4)" }}>
									<strong style={{ color: "var(--text-dark-primary)" }}>Known gaps</strong>
									<StatusBadge variant={knownGaps.length > 0 ? "warning" : "success"}>
										{knownGaps.length > 0 ? "operator follow-up" : "none found"}
									</StatusBadge>
								</div>
								{knownGaps.length === 0 ? (
									<p style={metaStyle}>No known-gaps.md entries were parsed.</p>
								) : (
									<div style={{ display: "grid", gap: "var(--sp-4)", minWidth: 0 }}>
										{knownGaps.map((gap) => (
											<div
												key={gap.id}
												style={{
													display: "grid",
													gridTemplateColumns: "auto minmax(0, 1fr) auto",
													gap: "var(--sp-4)",
													alignItems: "center",
													minWidth: 0,
												}}
											>
												<StatusBadge variant={severityVariant(gap.severity)}>
													{gap.severity}
												</StatusBadge>
												<span style={{ color: "var(--text-dark-body)", overflowWrap: "anywhere" }}>
													{gap.title}
												</span>
												<span style={metaStyle}>{gap.status}</span>
											</div>
										))}
									</div>
								)}
							</Card>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
