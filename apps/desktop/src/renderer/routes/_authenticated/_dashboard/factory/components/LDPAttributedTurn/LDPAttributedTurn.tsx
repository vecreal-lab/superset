import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/utils";
import { Bot, UserRound } from "lucide-react";
import type { LDPAuthorAttribution, LDPDialogueTurn } from "../LDPSurface";

const turnClasses: Record<LDPDialogueTurn["kind"], string> = {
	operator: "bg-primary text-primary-foreground",
	agent: "bg-muted/60",
	specialist: "border border-amber-500/40 bg-amber-500/10",
	system: "border border-dashed bg-background text-muted-foreground",
};

function attributionFromTurn(turn: LDPDialogueTurn): LDPAuthorAttribution {
	return (
		turn.author || {
			user: turn.speaker.toLowerCase().replace(/[^a-z0-9_-]+/g, "-"),
			role: turn.roleId,
			isAgent: turn.kind !== "operator",
			displayName: turn.speaker,
		}
	);
}

function AuthorChip({ attribution }: { attribution: LDPAuthorAttribution }) {
	const Icon = attribution.isAgent ? Bot : UserRound;
	return (
		<span className="inline-flex items-center gap-1.5 rounded-md border bg-background/70 px-2 py-1 text-xs">
			<Icon className="size-3" />
			<span className="font-medium">{attribution.displayName || attribution.user}</span>
			{attribution.role && <Badge variant="outline">{attribution.role}</Badge>}
		</span>
	);
}

export function LDPAttributedTurn({ turn }: { turn: LDPDialogueTurn }) {
	const attribution = attributionFromTurn(turn);
	return (
		<div className={cn("select-text rounded-md p-3 text-sm", turnClasses[turn.kind])}>
			<div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
				<AuthorChip attribution={attribution} />
				{turn.timestamp && <span className="opacity-70">{turn.timestamp}</span>}
			</div>
			<p className="select-text whitespace-pre-wrap leading-relaxed">{turn.content}</p>
		</div>
	);
}
