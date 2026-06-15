import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { MarkdownRenderer } from "renderer/components/MarkdownRenderer/MarkdownRenderer";
import { Button, Card, StatusBadge } from "renderer/components/vecreal";
import { electronTrpc } from "renderer/lib/electron-trpc";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/synthesis-receipts/",
)({
	component: FactorySynthesisReceiptsPage,
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
	gridTemplateColumns: "minmax(21rem, 0.38fr) minmax(0, 1fr)",
	gap: "var(--sp-8)",
	minWidth: 0,
	alignItems: "start",
};

const filterGridStyle: CSSProperties = {
	display: "grid",
	gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
	gap: "var(--sp-4)",
	minWidth: 0,
};

const inputStyle: CSSProperties = {
	width: "100%",
	minWidth: 0,
	border: "1px solid var(--border-dark)",
	borderRadius: "var(--r-4)",
	background: "var(--bg-card-dark-bottom)",
	color: "var(--text-dark-body)",
	padding: "var(--sp-5) var(--sp-6)",
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

function includesFilter(value: string, filter: string) {
	return !filter.trim() || value.toLowerCase().includes(filter.trim().toLowerCase());
}

function dateValue(isoDate: string) {
	return isoDate.slice(0, 10);
}

function FactorySynthesisReceiptsPage() {
	const [selectedPath, setSelectedPath] = useState("");
	const [woFilter, setWoFilter] = useState("");
	const [projectFilter, setProjectFilter] = useState("");
	const [dateFilter, setDateFilter] = useState("");
	const synthesesQuery = electronTrpc.factory.synthesisReceipts.listSyntheses.useQuery();
	const selectedQuery = electronTrpc.factory.synthesisReceipts.getSynthesis.useQuery(
		{ path: selectedPath },
		{ enabled: selectedPath.length > 0 },
	);

	const syntheses = synthesesQuery.data ?? [];
	const filteredSyntheses = useMemo(
		() =>
			syntheses.filter(
				(synthesis) =>
					includesFilter(synthesis.woId, woFilter) &&
					includesFilter(synthesis.project, projectFilter) &&
					includesFilter(dateValue(synthesis.modifiedAt), dateFilter),
			),
		[dateFilter, projectFilter, syntheses, woFilter],
	);

	useEffect(() => {
		if (!selectedPath && filteredSyntheses.length > 0) {
			setSelectedPath(filteredSyntheses[0].path);
		}
	}, [filteredSyntheses, selectedPath]);

	return (
		<div style={pageStyle}>
			<div style={scrollStyle}>
				<div style={stackStyle}>
					<header style={{ ...stackStyle, gap: "var(--sp-4)" }}>
						<div style={{ display: "flex", gap: "var(--sp-4)", flexWrap: "wrap" }}>
							<StatusBadge variant="info">SYNTHESIS packets</StatusBadge>
							<StatusBadge variant="neutral">{syntheses.length} receipts</StatusBadge>
							<StatusBadge variant="success">{filteredSyntheses.length} visible</StatusBadge>
						</div>
						<h1 style={{ margin: 0, color: "var(--text-dark-primary)", fontSize: "28px" }}>
							Synthesis Receipts
						</h1>
						<p style={{ ...metaStyle, maxWidth: "70ch" }}>
							Plain-English operator summaries across closed work orders, with quick
							filtering by date, project, and WO.
						</p>
					</header>

					<div style={gridStyle}>
						<div style={stackStyle}>
							<Card variant="compact" style={stackStyle}>
								<div style={filterGridStyle}>
									<label style={{ ...metaStyle, display: "grid", gap: "var(--sp-3)" }}>
										WO
										<input
											value={woFilter}
											onChange={(event) => setWoFilter(event.target.value)}
											placeholder="WO id"
											style={inputStyle}
										/>
									</label>
									<label style={{ ...metaStyle, display: "grid", gap: "var(--sp-3)" }}>
										Project
										<input
											value={projectFilter}
											onChange={(event) => setProjectFilter(event.target.value)}
											placeholder="project"
											style={inputStyle}
										/>
									</label>
									<label style={{ ...metaStyle, display: "grid", gap: "var(--sp-3)" }}>
										Date
										<input
											value={dateFilter}
											onChange={(event) => setDateFilter(event.target.value)}
											placeholder="YYYY-MM-DD"
											style={inputStyle}
										/>
									</label>
								</div>
							</Card>

							<Card variant="compact" style={stackStyle}>
								<strong style={{ color: "var(--text-dark-primary)" }}>Receipt cards</strong>
								{synthesesQuery.isLoading ? (
									<p style={metaStyle}>Loading SYNTHESIS packets...</p>
								) : filteredSyntheses.length === 0 ? (
									<p style={metaStyle}>No synthesis receipts match the current filters.</p>
								) : (
									<div style={{ display: "grid", gap: "var(--sp-4)", minWidth: 0 }}>
										{filteredSyntheses.map((synthesis) => (
											<Card
												key={synthesis.path}
												variant="interactive"
												selected={selectedPath === synthesis.path}
												style={stackStyle}
											>
												<div
													style={{
														display: "flex",
														justifyContent: "space-between",
														gap: "var(--sp-4)",
														alignItems: "center",
														minWidth: 0,
													}}
												>
													<strong style={{ color: "var(--text-dark-primary)", overflowWrap: "anywhere" }}>
														{synthesis.woId}
													</strong>
													<StatusBadge variant="info">{synthesis.project}</StatusBadge>
												</div>
												<span style={{ color: "var(--text-dark-body)", overflowWrap: "anywhere" }}>
													{synthesis.title}
												</span>
												<span style={pathStyle}>{synthesis.path}</span>
												<p style={{ ...metaStyle, margin: 0, overflowWrap: "anywhere" }}>
													{synthesis.excerpt}
												</p>
												<Button variant="secondary" size="sm" onClick={() => setSelectedPath(synthesis.path)}>
													Read receipt
												</Button>
											</Card>
										))}
									</div>
								)}
							</Card>
						</div>

						<Card variant="default" style={{ ...stackStyle, minWidth: 0 }}>
							<div style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-4)", flexWrap: "wrap" }}>
								<strong style={{ color: "var(--text-dark-primary)" }}>
									{selectedQuery.data?.title ?? "Select a SYNTHESIS packet"}
								</strong>
								{selectedQuery.data ? (
									<StatusBadge variant="success">{selectedQuery.data.project}</StatusBadge>
								) : null}
							</div>
							{selectedQuery.data ? <span style={pathStyle}>{selectedQuery.data.path}</span> : null}
							{selectedQuery.isLoading ? (
								<p style={metaStyle}>Loading synthesis receipt...</p>
							) : selectedQuery.data ? (
								<div data-allow-horizontal-scroll="true" style={{ maxWidth: "100%", overflowX: "auto" }}>
									<MarkdownRenderer content={selectedQuery.data.content} className="h-auto min-w-0" />
								</div>
							) : (
								<p style={metaStyle}>Choose a receipt to read the operator summary.</p>
							)}
						</Card>
					</div>
				</div>
			</div>
		</div>
	);
}
