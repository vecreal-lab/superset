import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { MarkdownRenderer } from "renderer/components/MarkdownRenderer/MarkdownRenderer";
import { Button, Card, StatusBadge } from "renderer/components/vecreal";
import { electronTrpc } from "renderer/lib/electron-trpc";

export const Route = createFileRoute("/_authenticated/_dashboard/factory/uiux/")({
	component: FactoryUiuxPage,
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
	gridTemplateColumns: "minmax(0, 1fr) minmax(20rem, 0.38fr)",
	gap: "var(--sp-8)",
	minWidth: 0,
	alignItems: "start",
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

function briefVariant(status: string) {
	if (status === "canonical") return "success";
	if (status === "inferred_available") return "warning";
	return "error";
}

function FactoryUiuxPage() {
	const [selectedBriefPath, setSelectedBriefPath] = useState("");
	const sourceDocsQuery = electronTrpc.factory.uiux.listScreensProposal.useQuery();
	const briefsQuery = electronTrpc.factory.uiux.listStageCBriefs.useQuery();
	const findingsQuery = electronTrpc.factory.uiux.listUIUXValidationFindings.useQuery();
	const selectedBriefQuery = electronTrpc.factory.uiux.readBrief.useQuery(
		{ path: selectedBriefPath },
		{ enabled: selectedBriefPath.length > 0 },
	);

	const sourceDocs = sourceDocsQuery.data ?? [];
	const briefs = briefsQuery.data ?? [];
	const findings = findingsQuery.data ?? [];

	useEffect(() => {
		if (selectedBriefPath || briefs.length === 0) return;
		const preferred = briefs.find((brief) => brief.canonicalExists || brief.inferredExists);
		if (preferred) {
			setSelectedBriefPath(
				preferred.canonicalExists ? preferred.canonicalPath : (preferred.inferredPath ?? ""),
			);
		}
	}, [briefs, selectedBriefPath]);

	const briefCounts = useMemo(
		() => ({
			canonical: briefs.filter((brief) => brief.status === "canonical").length,
			inferred: briefs.filter((brief) => brief.status === "inferred_available").length,
			missing: briefs.filter((brief) => brief.status === "missing").length,
		}),
		[briefs],
	);

	return (
		<div style={pageStyle}>
			<div style={scrollStyle}>
				<div style={stackStyle}>
					<header style={{ ...stackStyle, gap: "var(--sp-4)" }}>
						<div style={{ display: "flex", gap: "var(--sp-4)", flexWrap: "wrap" }}>
							<StatusBadge variant="info">UIUX scope workspace</StatusBadge>
							<StatusBadge variant="success">{briefCounts.canonical} canonical</StatusBadge>
							<StatusBadge variant="warning">{briefCounts.inferred} inferred</StatusBadge>
							<StatusBadge variant={briefCounts.missing > 0 ? "error" : "success"}>
								{briefCounts.missing} missing
							</StatusBadge>
						</div>
						<h1 style={{ margin: 0, color: "var(--text-dark-primary)", fontSize: "28px" }}>
							UIUX Area
						</h1>
						<p style={{ ...metaStyle, maxWidth: "74ch" }}>
							Operator workspace for Stage A direction, Stage B screen proposal, Stage C
							brief coverage, inferred brief handoff, and UIUX_VALIDATION findings.
						</p>
					</header>

					<div style={gridStyle}>
						<div style={stackStyle}>
							{sourceDocs.map((document) => (
								<Card key={document.path} variant="default" style={{ ...stackStyle, minWidth: 0 }}>
									<div style={{ display: "flex", gap: "var(--sp-4)", alignItems: "center", flexWrap: "wrap" }}>
										<strong style={{ color: "var(--text-dark-primary)" }}>{document.title}</strong>
										<StatusBadge variant={document.exists ? "success" : "warning"}>
											{document.exists ? "available" : "missing"}
										</StatusBadge>
									</div>
									<span style={pathStyle}>{document.path}</span>
									{document.exists ? (
										<div style={{ maxWidth: "100%", overflowX: "auto" }}>
											<MarkdownRenderer content={document.content} className="h-auto min-w-0" />
										</div>
									) : (
										<p style={metaStyle}>This source document was not found on disk.</p>
									)}
								</Card>
							))}

							<Card variant="default" style={{ ...stackStyle, minWidth: 0 }}>
								<div style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-4)", flexWrap: "wrap" }}>
									<strong style={{ color: "var(--text-dark-primary)" }}>Selected Stage C brief</strong>
									{selectedBriefQuery.data ? (
										<StatusBadge variant={selectedBriefQuery.data.exists ? "success" : "warning"}>
											{selectedBriefQuery.data.exists ? "loaded" : "missing"}
										</StatusBadge>
									) : null}
								</div>
								{selectedBriefQuery.data ? (
									<>
										<span style={pathStyle}>{selectedBriefQuery.data.path}</span>
										{selectedBriefQuery.data.exists ? (
											<div style={{ maxWidth: "100%", overflowX: "auto" }}>
												<MarkdownRenderer
													content={selectedBriefQuery.data.content}
													className="h-auto min-w-0"
												/>
											</div>
										) : (
											<p style={metaStyle}>No brief content found.</p>
										)}
									</>
								) : (
									<p style={metaStyle}>Select a Stage C brief from the coverage board.</p>
								)}
							</Card>
						</div>

						<div style={stackStyle}>
							<Card variant="compact" style={stackStyle}>
								<strong style={{ color: "var(--text-dark-primary)" }}>Stage C coverage</strong>
								<div style={{ display: "grid", gap: "var(--sp-4)", minWidth: 0 }}>
									{briefsQuery.isLoading ? (
										<p style={metaStyle}>Loading screen coverage...</p>
									) : (
										briefs.map((brief) => {
											const loadPath = brief.canonicalExists
												? brief.canonicalPath
												: (brief.inferredPath ?? "");
											return (
												<div
													key={brief.screenId}
													style={{
														display: "grid",
														gap: "var(--sp-4)",
														minWidth: 0,
														border: "1px solid var(--border-dark)",
														borderRadius: "var(--r-5)",
														padding: "var(--sp-6)",
														background: "var(--bg-card-dark-bottom)",
													}}
												>
													<div
														style={{
															display: "flex",
															justifyContent: "space-between",
															alignItems: "center",
															gap: "var(--sp-4)",
															minWidth: 0,
														}}
													>
														<strong style={{ color: "var(--text-dark-body)" }}>{brief.title}</strong>
														<StatusBadge variant={briefVariant(brief.status)}>
															{brief.status.replace("_", " ")}
														</StatusBadge>
													</div>
													<span style={pathStyle}>{brief.route}</span>
													<div style={{ display: "flex", gap: "var(--sp-4)", flexWrap: "wrap" }}>
														<Button
															variant="secondary"
															size="sm"
															disabled={!loadPath}
															onClick={() => setSelectedBriefPath(loadPath)}
														>
															Read brief
														</Button>
														{brief.status !== "canonical" ? (
															<Button
																variant="ghost"
																size="sm"
																onClick={() =>
																	window.open(
																		`/factory/projects/software-factory?stageC=${encodeURIComponent(
																			brief.screenId,
																		)}`,
																		"_self",
																	)
																}
															>
																Author Stage C brief
															</Button>
														) : null}
													</div>
												</div>
											);
										})
									)}
								</div>
							</Card>

							<Card variant="compact" style={stackStyle}>
								<div style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-4)" }}>
									<strong style={{ color: "var(--text-dark-primary)" }}>
										UIUX_VALIDATION findings
									</strong>
									<StatusBadge variant={findings.length > 0 ? "warning" : "success"}>
										{findings.length}
									</StatusBadge>
								</div>
								{findings.length === 0 ? (
									<p style={metaStyle}>No UIUX_VALIDATION receipts were found under runs.</p>
								) : (
									<div style={{ display: "grid", gap: "var(--sp-4)", minWidth: 0 }}>
										{findings.map((finding) => (
											<div
												key={finding.id}
												style={{
													display: "grid",
													gap: "var(--sp-3)",
													minWidth: 0,
													borderTop: "1px solid var(--border-dark)",
													paddingTop: "var(--sp-5)",
												}}
											>
												<strong style={{ color: "var(--text-dark-body)" }}>{finding.title}</strong>
												<span style={pathStyle}>{finding.path}</span>
												<p style={{ ...metaStyle, margin: 0, overflowWrap: "anywhere" }}>
													{finding.excerpt}
												</p>
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
