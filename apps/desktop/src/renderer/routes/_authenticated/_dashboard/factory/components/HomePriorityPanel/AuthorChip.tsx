import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/utils";
import type { AuthorAttribution } from "lib/types/factory-operator-console";

function initialsFor(name: string): string {
	const parts = name
		.replace(/[_-]+/g, " ")
		.split(/\s+/)
		.filter(Boolean);
	const initials = parts
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join("");
	return initials || "A";
}

export function AuthorChip({
	attribution,
	addressedTo,
	className,
}: {
	attribution: AuthorAttribution;
	addressedTo?: string;
	className?: string;
}) {
	return (
		<div className={cn("flex min-w-0 items-center gap-2", className)}>
			<div className="flex size-6 shrink-0 items-center justify-center rounded-full border bg-background text-[10px] font-semibold">
				{initialsFor(attribution.displayName)}
			</div>
			<div className="min-w-0">
				<div className="flex min-w-0 flex-wrap items-center gap-1.5">
					<span className="truncate text-xs font-medium">
						{attribution.displayName}
					</span>
					{attribution.role && (
						<Badge variant="outline" className="h-5 px-1.5 text-[10px]">
							{attribution.role}
						</Badge>
					)}
				</div>
				{addressedTo && (
					<div className="mt-0.5 text-[11px] text-muted-foreground">
						For {addressedTo}
					</div>
				)}
			</div>
		</div>
	);
}
