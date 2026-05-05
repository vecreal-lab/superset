import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Switch } from "@superset/ui/switch";
import { cn } from "@superset/ui/utils";
import { ArrowRight, Info, MessageSquare } from "lucide-react";
import { useMemo, useState } from "react";
import { useSetActiveProjectId } from "renderer/stores/active-project";
import { DialogueAttentionBadge } from "../FactorySidebar/components/DialogueAttentionBadge";
import { formatDate } from "../FactoryView";
import {
	useDialogueAttentionCounts,
	type DialogueRecord,
} from "../../hooks/useDialogueAttentionCounts";
import { AuthorChip } from "./AuthorChip";

const SURFACE_ROUTES: Record<string, string> = {
	home: "/factory",
	mission: "/factory/mission",
	foundations: "/factory/foundations",
	intake: "/factory/intake",
	"work-orders": "/factory/work-orders",
	approvals: "/factory/approvals",
	"strategy-pulse": "/factory/strategy-pulse",
	roles: "/factory/roles",
	"build-vs-compose": "/factory/build-vs-compose",
	decisions: "/factory/decisions",
	lessons: "/factory/lessons",
	projects: "/factory/projects",
	dialogues: "/factory/dialogues",
};

interface RetrievalGapPriorityRow {
	id: string;
	surface: string;
	message: string;
	sourcePath?: string;
}

const retrievalGapRows: RetrievalGapPriorityRow[] = [];

function stateLabel(state: string): string {
	return state.replace(/_/g, " ");
}

function surfaceLabel(surface: string): string {
	return surface.replace(/[-_/]+/g, " ");
}

function routeForSurface(surface: string): string {
	return SURFACE_ROUTES[surface] || "/factory/dialogues";
}

function openDialogue(dialogue: DialogueRecord, setActiveProjectId: (projectId: string) => void) {
	setActiveProjectId(dialogue.project);
	window.location.hash = `${routeForSurface(dialogue.surface)}?dialogueId=${encodeURIComponent(dialogue.id)}`;
}

function primaryAgentAttribution(dialogue: DialogueRecord) {
	const participant = dialogue.participants.find(
		(item) => item.isAgent && item.role === dialogue.primary_agent,
	);
	return (
		participant || {
			user: dialogue.primary_agent.toLowerCase(),
			role: dialogue.primary_agent,
			isAgent: true,
			displayName: dialogue.primary_agent,
		}
	);
}

export function HomePriorityPanel() {
	const setActiveProjectId = useSetActiveProjectId();
	const {
		counts,
		isLoading,
		itemsForCurrentOperator,
		workspace,
	} = useDialogueAttentionCounts();
	const [needsMineOnly, setNeedsMineOnly] = useState(true);
	const items = useMemo(
		() => (needsMineOnly ? itemsForCurrentOperator : counts.items),
		[itemsForCurrentOperator, counts.items, needsMineOnly],
	);
	const hasMineAttention = items.some((item) => item.is_mine);

	return (
		<section className="overflow-hidden rounded-md border">
			<div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<h2 className="text-sm font-medium">Priority Dialogues</h2>
						<DialogueAttentionBadge
							count={items.length}
							hasMineAttention={hasMineAttention}
						/>
					</div>
					<p className="mt-1 max-w-2xl text-xs text-muted-foreground">
						Only conversations waiting on you are listed here.
					</p>
				</div>
				<label className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs">
					<Switch
						checked={needsMineOnly}
						onCheckedChange={setNeedsMineOnly}
						aria-label="Show only dialogues needing my reply"
					/>
					<span>Needs MY reply</span>
				</label>
			</div>
			<div className="divide-y">
				{isLoading ? (
					<div className="flex items-center gap-3 px-4 py-5 text-sm text-muted-foreground">
						<MessageSquare className="size-4" />
						Loading dialogue attention for {workspace.workspaceId}...
					</div>
				) : items.length === 0 && retrievalGapRows.length === 0 ? (
					<div className="flex items-center gap-3 px-4 py-5 text-sm text-muted-foreground">
						<MessageSquare className="size-4" />
						No conversations need your attention right now.
					</div>
				) : (
					<>
						{retrievalGapRows.map((row) => (
							<div
								key={row.id}
								className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)_auto]"
							>
								<div className="flex items-center gap-2 text-muted-foreground">
									<Info className="size-4" />
									Retrieval gap
								</div>
								<div>
									<div className="font-medium">{surfaceLabel(row.surface)}</div>
									<p className="mt-1 text-muted-foreground">{row.message}</p>
								</div>
								<Badge variant="outline">Info</Badge>
							</div>
						))}
						{items.map((item) => {
							const target = routeForSurface(item.surface);
							return (
								<div
									key={`${item.surface}-${item.id}`}
									className={cn(
										"grid gap-3 px-4 py-3 text-sm md:grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)_minmax(11rem,14rem)_auto]",
										item.is_mine &&
											"border-l-2 border-l-[color:var(--clay-light)]",
									)}
								>
									<div className="min-w-0">
										<div className="font-medium capitalize">
											{surfaceLabel(item.surface)}
										</div>
										<Badge
											variant="outline"
											className="mt-2 capitalize"
											style={{
												borderColor: "var(--clay-light)",
												color: "var(--clay-light)",
											}}
										>
											{stateLabel(item.state)}
										</Badge>
									</div>
									<div className="min-w-0">
										<p className="line-clamp-2 text-sm">
											{item.last_message_preview || item.title}
										</p>
										<p className="mt-2 text-xs text-muted-foreground">
											Last activity: {formatDate(item.last_activity_at)}
										</p>
										<p className="mt-1 font-mono text-[11px] text-muted-foreground">
											{target}?dialogueId={item.id.slice(0, 8)}
										</p>
									</div>
									<AuthorChip
										attribution={primaryAgentAttribution(item)}
										addressedTo={item.is_mine ? "you" : "operator"}
									/>
									<Button
										type="button"
										size="sm"
										variant="outline"
										onClick={() => openDialogue(item, setActiveProjectId)}
									>
										Open
										<ArrowRight className="size-4" />
									</Button>
								</div>
							);
						})}
					</>
				)}
			</div>
			<div className="border-t bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
				Showing conversations assigned to {workspace.currentOperatorDisplayName}
				in {workspace.workspaceId}.
			</div>
		</section>
	);
}
