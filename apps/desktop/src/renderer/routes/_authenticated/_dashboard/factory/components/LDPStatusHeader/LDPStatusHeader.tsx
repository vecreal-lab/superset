import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/utils";
import type { LDPMetricTone, LDPStatusSummary } from "../LDPSurface";

function toneClass(tone: LDPMetricTone = "default"): string {
	return cn(
		tone === "success" && "text-emerald-600 dark:text-emerald-400",
		tone === "warning" && "text-amber-600 dark:text-amber-400",
		tone === "danger" && "text-destructive",
	);
}

function kindLabel(kind: LDPStatusSummary["kind"]): string {
	return {
		document: "Document-backed",
		read_model: "Read-model-backed",
		composite: "Composite",
		foundation: "Foundation-class",
	}[kind];
}

export function LDPStatusHeader({ summary }: { summary: LDPStatusSummary }) {
	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-2">
				<Badge variant="secondary">{kindLabel(summary.kind)}</Badge>
				<Badge variant="outline">{summary.label}</Badge>
				<Badge variant="outline">{summary.state.replace(/_/g, " ")}</Badge>
				<Badge variant="outline">{summary.primaryAgent}</Badge>
			</div>
			<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
				{summary.metrics.map((metric) => (
					<div key={metric.label} className="rounded-md border bg-muted/20 px-3 py-2">
						<div className="text-xs text-muted-foreground">{metric.label}</div>
						<div className={cn("mt-1 text-sm font-medium", toneClass(metric.tone))}>
							{metric.value}
						</div>
					</div>
				))}
			</div>
			<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				{summary.sourcePath && (
					<span className="font-mono">Source: {summary.sourcePath}</span>
				)}
				{summary.lastUpdated && <span>Updated {summary.lastUpdated}</span>}
				{summary.flags?.map((flag) => (
					<span key={flag.label} className={toneClass(flag.tone)}>
						{flag.label}
					</span>
				))}
			</div>
		</div>
	);
}
