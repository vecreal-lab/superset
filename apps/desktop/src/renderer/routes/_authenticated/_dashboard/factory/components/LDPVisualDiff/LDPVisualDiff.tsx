import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/utils";
import { buildLineVisualDiff } from "shared/factory-visual-diff";

interface LDPVisualDiffProps {
	before: string;
	after: string;
	title?: string;
	beforeLabel?: string;
	afterLabel?: string;
}

export function LDPVisualDiff({
	before,
	after,
	title = "Visual diff",
	beforeLabel = "Before",
	afterLabel = "After",
}: LDPVisualDiffProps) {
	const lines = buildLineVisualDiff(before, after);
	const additions = lines.filter((line) => line.kind === "added").length;
	const removals = lines.filter((line) => line.kind === "removed").length;

	return (
		<section className="overflow-hidden rounded-md border">
			<div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
				<div>
					<h2 className="text-sm font-medium">{title}</h2>
					<p className="mt-0.5 text-xs text-muted-foreground">
						{beforeLabel} {"->"} {afterLabel}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Badge variant="outline" className="text-emerald-600 dark:text-emerald-400">
						+{additions}
					</Badge>
					<Badge variant="outline" className="text-destructive">
						-{removals}
					</Badge>
				</div>
			</div>
			<div className="max-h-96 overflow-auto bg-background font-mono text-xs">
				{lines.map((line) => (
					<div
						key={line.id}
						className={cn(
							"grid grid-cols-[3.5rem_3.5rem_minmax(0,1fr)] border-b border-border/40",
							line.kind === "added" && "bg-emerald-500/10",
							line.kind === "removed" && "bg-destructive/10",
						)}
					>
						<div className="select-none border-r px-2 py-1 text-right text-muted-foreground">
							{line.oldLineNumber ?? ""}
						</div>
						<div className="select-none border-r px-2 py-1 text-right text-muted-foreground">
							{line.newLineNumber ?? ""}
						</div>
						<pre className="min-w-0 overflow-x-auto whitespace-pre-wrap break-words px-3 py-1">
							{line.kind === "added" ? "+ " : line.kind === "removed" ? "- " : "  "}
							{line.content || " "}
						</pre>
					</div>
				))}
			</div>
		</section>
	);
}
