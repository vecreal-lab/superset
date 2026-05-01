import { Badge } from "@superset/ui/badge";
import type { LDPDialogueAgent } from "../LDPSurface";

export function LDPDialogueHeader({ agent }: { agent: LDPDialogueAgent }) {
	return (
		<div className="border-b px-4 py-3">
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="truncate text-sm font-medium">{agent.name}</div>
					{agent.description && (
						<div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
							{agent.description}
						</div>
					)}
				</div>
				<Badge variant="outline">{agent.roleId}</Badge>
			</div>
		</div>
	);
}
