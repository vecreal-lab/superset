import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/utils";
import type { LDPDialogueTurn } from "../LDPSurface";

const turnClasses: Record<LDPDialogueTurn["kind"], string> = {
	operator: "bg-primary text-primary-foreground",
	agent: "bg-muted/60",
	specialist: "border border-amber-500/40 bg-amber-500/10",
	system: "border border-dashed bg-background text-muted-foreground",
};

export function LDPAttributedTurn({ turn }: { turn: LDPDialogueTurn }) {
	return (
		<div className={cn("rounded-md p-3 text-sm", turnClasses[turn.kind])}>
			<div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
				<span className="font-medium">{turn.speaker}</span>
				{turn.roleId && <Badge variant="outline">{turn.roleId}</Badge>}
				{turn.timestamp && <span className="opacity-70">{turn.timestamp}</span>}
			</div>
			<p className="whitespace-pre-wrap leading-relaxed">{turn.content}</p>
		</div>
	);
}
