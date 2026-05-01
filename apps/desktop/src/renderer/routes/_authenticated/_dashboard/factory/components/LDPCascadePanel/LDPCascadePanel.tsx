import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { ArrowRight } from "lucide-react";
import type { LDPCascadeDraft } from "../LDPSurface";

export function LDPCascadePanel({ drafts }: { drafts: LDPCascadeDraft[] }) {
	return (
		<div className="space-y-3 p-4">
			<div>
				<h2 className="text-sm font-medium">Cascade drafts</h2>
				<p className="mt-1 text-xs text-muted-foreground">
					Queued follow-up work orders from the committed dialogue.
				</p>
			</div>
			<div className="space-y-2">
				{drafts.map((draft) => (
					<div key={draft.id} className="rounded-md border p-3">
						<div className="flex items-start justify-between gap-2">
							<div className="min-w-0">
								<div className="truncate text-sm font-medium">{draft.title}</div>
								<div className="mt-1 font-mono text-xs text-muted-foreground">
									{draft.id}
								</div>
							</div>
							<Badge variant="outline">{draft.status}</Badge>
						</div>
						{draft.summary && (
							<p className="mt-2 text-xs text-muted-foreground">{draft.summary}</p>
						)}
						<Button asChild size="sm" variant="ghost" className="mt-2 px-0">
							<a href={`#${draft.href}`}>
								Open draft
								<ArrowRight className="size-4" />
							</a>
						</Button>
					</div>
				))}
			</div>
		</div>
	);
}
