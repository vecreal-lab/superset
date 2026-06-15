import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { MarkdownRenderer } from "renderer/components/MarkdownRenderer/MarkdownRenderer";
import { Card, StatusBadge } from "renderer/components/vecreal";
import { electronTrpc } from "renderer/lib/electron-trpc";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/audit-findings/",
)({
	component: FactoryAuditFindingsPage,
});

type SeverityFilter = "all" | "info" | "warning" | "blocker";

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
	gridTemplateColumns: "minmax(20rem, 0.36fr) minmax(0, 1fr)",
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

const inputStyle: CSSProperties = {
	width: "100%",
	minWidth: 0,
	border: "1px solid var(--border-dark)",
	borderRadius: "var(--r-4)",
	background: "var(--bg-card-dark-bottom)",
	color: "var(--text-dark-body)",
	padding: "var(--sp-5) var(--sp-6)",
};

function severityVariant(severity: string) {
	if (severity === "blocker") return "error";
	if (severity === "warning") return "warning";
	return "info";
}

function FactoryAuditFindingsPage() {
	const [selectedPath, setSelectedPath] = useState("");
	const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
	const auditsQuery = electronTrpc.factory.auditFindings.listAudits.useQuery();
	const patternsQuery = electronTrpc.factory.auditFindings.detectRecurringPatterns.useQuery();
	const selectedAuditQuery = electronTrpc.factory.auditFindings.getAudit.useQuery(
		{ path: selectedPath },
		{ enabled: selectedPath.length > 0 },
	);

	const audits = auditsQuery.data ?? [];
	const patterns = patternsQuery.data ?? [];
	const filteredAudits = useMemo(
		() =>
			audits.filter(
				(audit) => severityFilter === "all" || audit.severity === severityFilter,
			),
		[audits, severityFilter],
	);

	useEffect(() => {
		if (!selectedPath && filteredAudits.length > 0) {
			setSelectedPath(filteredAudits[0].path);
		}
	}, [filteredAudits, selectedPath]);

	return (
		<div style={pageStyle}>
			<div style={scrollStyle}>
				<div style={stackStyle}>
					<header style={{ ...stackStyle, gap: "var(--sp-4)" }}>
						<div style={{ display: "flex", gap: "var(--sp-4)", flexWrap: "wrap" }}>
							<StatusBadge variant="info">AUDIT receipts</StatusBadge>
							<StatusBadge variant="neutral">{audits.length} receipts</StatusBadge>
							<StatusBadge variant={patterns.length > 0 ? "warning" : "success"}>
								{patterns.length} recurring patterns
							</StatusBadge>
						</div>
						<h1 style={{ margin: 0, color: "var(--text-dark-primary)", fontSize: "28px" }}>
							Audit Findings
						</h1>
						<p style={{ ...metaStyle, maxWidth: "70ch" }}>
							Cross-work-order AUDIT browser for seeing factory quality patterns without
							opening individual run folders.
						</p>
					</header>

					<div style={gridStyle}>
						<div style={stackStyle}>
							<Card variant="compact" style={stackStyle}>
								<label style={{ ...metaStyle, display: "grid", gap: "var(--sp-3)" }}>
									Severity filter
									<select
										value={severityFilter}
										onChange={(event) => setSeverityFilter(event.target.value as SeverityFilter)}
										style={inputStyle}
									>
										<option value="all">All severities</option>
										<option value="info">Info</option>
										<option value="warning">Warning</option>
										<option value="blocker">Blocker</option>
									</select>
								</label>
							</Card>

							<Card variant="compact" style={stackStyle}>
								<strong style={{ color: "var(--text-dark-primary)" }}>Receipts by WO</strong>
								{auditsQuery.isLoading ? (
									<p style={metaStyle}>Loading AUDIT receipts...</p>
								) : filteredAudits.length === 0 ? (
									<p style={metaStyle}>No audit receipts match this filter.</p>
								) : (
									<div style={{ display: "grid", gap: "var(--sp-4)", minWidth: 0 }}>
										{filteredAudits.map((audit) => (
											<button
												key={audit.path}
												type="button"
												onClick={() => setSelectedPath(audit.path)}
												style={{
													display: "grid",
													gap: "var(--sp-3)",
													minWidth: 0,
													border: "1px solid var(--border-dark)",
													borderRadius: "var(--r-5)",
													background:
														selectedPath === audit.path
															? "var(--bg-pill-dark)"
															: "var(--bg-card-dark-bottom)",
													color: "var(--text-dark-body)",
													padding: "var(--sp-6)",
													textAlign: "left",
													cursor: "pointer",
												}}
											>
												<div
													style={{
														display: "flex",
														justifyContent: "space-between",
														gap: "var(--sp-4)",
														alignItems: "center",
													}}
												>
													<strong>{audit.woId}</strong>
													<StatusBadge variant={severityVariant(audit.severity)}>
														{audit.severity}
													</StatusBadge>
												</div>
												<span style={{ color: "var(--text-dark-body)", overflowWrap: "anywhere" }}>
													{audit.title}
												</span>
												<span style={pathStyle}>{audit.path}</span>
											</button>
										))}
									</div>
								)}
							</Card>

							<Card variant="compact" style={stackStyle}>
								<strong style={{ color: "var(--text-dark-primary)" }}>
									Recurring patterns
								</strong>
								{patterns.length === 0 ? (
									<p style={metaStyle}>No recurring audit text patterns detected yet.</p>
								) : (
									<div style={{ display: "grid", gap: "var(--sp-4)", minWidth: 0 }}>
										{patterns.map((pattern) => (
											<div key={pattern.id} style={{ display: "grid", gap: "var(--sp-3)" }}>
												<div style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-4)" }}>
													<StatusBadge variant={severityVariant(pattern.severity)}>
														{pattern.severity}
													</StatusBadge>
													<span style={metaStyle}>{pattern.count} receipts</span>
												</div>
												<p style={{ margin: 0, color: "var(--text-dark-body)", overflowWrap: "anywhere" }}>
													{pattern.text}
												</p>
											</div>
										))}
									</div>
								)}
							</Card>
						</div>

						<Card variant="default" style={{ ...stackStyle, minWidth: 0 }}>
							<div style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-4)", flexWrap: "wrap" }}>
								<strong style={{ color: "var(--text-dark-primary)" }}>
									{selectedAuditQuery.data?.title ?? "Select an AUDIT receipt"}
								</strong>
								{selectedAuditQuery.data ? (
									<StatusBadge variant={severityVariant(selectedAuditQuery.data.severity)}>
										{selectedAuditQuery.data.severity}
									</StatusBadge>
								) : null}
							</div>
							{selectedAuditQuery.data ? <span style={pathStyle}>{selectedAuditQuery.data.path}</span> : null}
							{selectedAuditQuery.isLoading ? (
								<p style={metaStyle}>Loading audit receipt...</p>
							) : selectedAuditQuery.data ? (
								<div data-allow-horizontal-scroll="true" style={{ maxWidth: "100%", overflowX: "auto" }}>
									<MarkdownRenderer
										content={selectedAuditQuery.data.content}
										className="h-auto min-w-0"
									/>
								</div>
							) : (
								<p style={metaStyle}>Choose a receipt to inspect its findings.</p>
							)}
						</Card>
					</div>
				</div>
			</div>
		</div>
	);
}
