import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@superset/ui/sheet";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { cn } from "@superset/ui/utils";
import {
	Archive,
	ArrowUpDown,
	Clock,
	Filter,
	MessageSquare,
	RotateCcw,
	Search,
	Undo2,
	UserRound,
} from "lucide-react";
import { type KeyboardEvent, useMemo, useState } from "react";
import type { AuthorAttribution, StaleStateNotice as StaleStateNoticeShape } from "lib/types/factory-operator-console";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	useActiveProjectId,
	useSetActiveProjectId,
} from "renderer/stores/active-project";
import { FactorySearch, formatDate } from "../FactoryView";
import type { DialogueRecord, DialogueState } from "../../hooks/useDialogueAttentionCounts";

const STATE_OPTIONS: Array<{ value: "all" | DialogueState; label: string }> = [
	{ value: "all", label: "All states" },
	{ value: "needs_reply", label: "Needs reply" },
	{ value: "awaiting_commit", label: "Awaiting commit" },
	{ value: "awaiting_confirmation", label: "Awaiting confirmation" },
	{ value: "agent_thinking", label: "Agent thinking" },
	{ value: "idle_exploratory", label: "Idle exploratory" },
	{ value: "shelved", label: "Shelved" },
	{ value: "cascade_pending", label: "Cascade pending" },
	{ value: "abandoned", label: "Abandoned" },
	{ value: "committed_resolved", label: "Committed and resolved" },
];

const HIGH_ATTENTION_STATES = new Set<DialogueState>([
	"needs_reply",
	"awaiting_commit",
	"awaiting_confirmation",
]);

const SURFACE_ROUTES: Record<string, string> = {
	home: "/factory",
	mission: "/factory/mission",
	foundations: "/factory/foundations",
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

function stateLabel(state: string): string {
	return state.replace(/_/g, " ");
}

function surfaceLabel(surface: string): string {
	return surface.replace(/[-_/]+/g, " ");
}

function stateTone(state: DialogueState): "secondary" | "outline" | "destructive" {
	if (state === "abandoned") return "destructive";
	if (state === "needs_reply" || state === "awaiting_commit") return "secondary";
	return "outline";
}

function routeForSurface(surface: string): string {
	return SURFACE_ROUTES[surface] || "/factory/dialogues";
}

function fallbackAuthor(dialogue: DialogueRecord): AuthorAttribution {
	const agent = dialogue.primary_agent || "ORCH";
	if (dialogue.author && dialogue.author !== "agent") {
		return {
			user: dialogue.author,
			isAgent: false,
			displayName: dialogue.author === "yuriy" ? "Yuriy" : dialogue.author,
		};
	}
	return {
		user: "agent",
		role: agent,
		isAgent: true,
		displayName: agent,
	};
}

function primaryAuthor(dialogue: DialogueRecord): AuthorAttribution {
	return (
		dialogue.participants?.find((participant) => !participant.isAgent) ||
		dialogue.participants?.[0] ||
		fallbackAuthor(dialogue)
	);
}

function AuthorChip({
	attribution,
	size = "sm",
}: {
	attribution: AuthorAttribution;
	size?: "sm" | "md";
}) {
	const label = attribution.displayName || attribution.user;
	const initial = label.slice(0, 1).toUpperCase() || "?";
	return (
		<span
			className={cn(
				"inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-1.5 py-1 text-xs",
				size === "md" && "px-2 py-1.5 text-sm",
			)}
			title={attribution.role ? `${label} - ${attribution.role}` : label}
		>
			<span
				className={cn(
					"flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
					attribution.isAgent
						? "bg-primary/10 text-primary"
						: "bg-muted text-foreground",
				)}
			>
				{initial}
			</span>
			<span className="truncate">{label}</span>
			{attribution.role && (
				<span className="rounded-sm bg-muted px-1 font-mono text-[10px] text-muted-foreground">
					{attribution.role}
				</span>
			)}
		</span>
	);
}

function DialogueAttentionBadge({
	state,
	hasMineAttention,
}: {
	state: DialogueState;
	hasMineAttention: boolean;
}) {
	return (
		<Badge
			variant={stateTone(state)}
			className={cn(
				"capitalize",
				hasMineAttention && "border-primary/30 bg-primary/10 text-primary",
			)}
		>
			{hasMineAttention ? "Needs MY reply" : stateLabel(state)}
		</Badge>
	);
}

function StaleStateNotice({ notice }: { notice: StaleStateNoticeShape }) {
	return (
		<div className="mt-2 rounded-md border border-dashed bg-muted/20 px-2.5 py-2 text-xs text-muted-foreground">
			<div className="flex items-start gap-2">
				<Clock className="mt-0.5 size-3.5 shrink-0" />
				<div className="min-w-0">
					<div className="font-medium text-foreground">Surface changed</div>
					<div className="mt-0.5">{notice.summary}</div>
					<div className="mt-1 truncate font-mono">{notice.sourcePath}</div>
				</div>
			</div>
		</div>
	);
}

function LoadingDots() {
	return (
		<span className="inline-flex items-center gap-1 text-muted-foreground">
			<span className="size-1.5 animate-pulse rounded-full bg-current" />
			<span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
			<span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
			Loading dialogues
		</span>
	);
}

export function LDPInbox() {
	const activeProjectId = useActiveProjectId();
	const setActiveProjectId = useSetActiveProjectId();
	const utils = electronTrpc.useUtils();
	const [query, setQuery] = useState("");
	const [stateFilter, setStateFilter] = useState<"all" | DialogueState>("all");
	const [includeArchived, setIncludeArchived] = useState(false);
	const [needsMineOnly, setNeedsMineOnly] = useState(false);
	const [sortDirection, setSortDirection] = useState<"newest" | "oldest">("newest");
	const [drawerOpen, setDrawerOpen] = useState(false);
	const listQuery = electronTrpc.factory.dialogue.list.useQuery(
		{
			project: activeProjectId,
			includeArchived,
			states: stateFilter === "all" ? undefined : [stateFilter],
		},
		{ refetchInterval: 5000 },
	);
	const resumeMutation = electronTrpc.factory.dialogue.resume.useMutation();
	const shelveMutation = electronTrpc.factory.dialogue.shelve.useMutation();
	const unshelveMutation = electronTrpc.factory.dialogue.unshelve.useMutation();
	const archiveMutation = electronTrpc.factory.dialogue.archive.useMutation();
	const rows = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return ((listQuery.data || []) as DialogueRecord[])
			.filter((dialogue) =>
				needsMineOnly ? dialogue.is_mine && dialogue.state === "needs_reply" : true,
			)
			.filter((dialogue) =>
				needle
					? `${dialogue.title} ${dialogue.surface} ${dialogue.state} ${dialogue.last_message_preview} ${primaryAuthor(dialogue).displayName}`
							.toLowerCase()
							.includes(needle)
					: true,
			)
			.sort((a, b) => {
				const direction = sortDirection === "newest" ? -1 : 1;
				return direction * a.last_activity_at.localeCompare(b.last_activity_at);
			});
	}, [listQuery.data, needsMineOnly, query, sortDirection]);
	const metrics = useMemo(() => {
		const allRows = (listQuery.data || []) as DialogueRecord[];
		const highAttention = allRows.filter((dialogue) =>
			HIGH_ATTENTION_STATES.has(dialogue.state),
		).length;
		const stale = allRows.filter((dialogue) => dialogue.stale_state_notice).length;
		return {
			total: allRows.length,
			highAttention,
			stale,
			visible: rows.length,
		};
	}, [listQuery.data, rows.length]);

	async function refreshDialogueQueries() {
		await Promise.all([
			utils.factory.dialogue.list.invalidate(),
			utils.factory.dialogue.attentionCounts.invalidate(),
		]);
	}

	async function runAction(
		mutation:
			| typeof resumeMutation
			| typeof shelveMutation
			| typeof unshelveMutation
			| typeof archiveMutation,
		dialogue: DialogueRecord,
	) {
		await mutation.mutateAsync({
			project: dialogue.project,
			surface: dialogue.surface,
			dialogueId: dialogue.id,
		});
		await refreshDialogueQueries();
	}

	function openDialogue(dialogue: DialogueRecord) {
		setActiveProjectId(dialogue.project);
		window.location.hash = `${routeForSurface(dialogue.surface)}?dialogueId=${encodeURIComponent(dialogue.id)}`;
	}

	function handleRowKeyDown(
		event: KeyboardEvent<HTMLTableRowElement>,
		dialogue: DialogueRecord,
	) {
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		openDialogue(dialogue);
	}

	return (
		<div className="space-y-4">
			<div className="grid gap-3 md:grid-cols-4">
				<div className="rounded-md border bg-background px-3 py-2">
					<div className="text-xs text-muted-foreground">Visible</div>
					<div className="mt-1 text-sm font-medium">{metrics.visible}</div>
				</div>
				<div className="rounded-md border bg-background px-3 py-2">
					<div className="text-xs text-muted-foreground">High attention</div>
					<div className="mt-1 text-sm font-medium text-primary">
						{metrics.highAttention}
					</div>
				</div>
				<div className="rounded-md border bg-background px-3 py-2">
					<div className="text-xs text-muted-foreground">Stale state</div>
					<div className="mt-1 text-sm font-medium">{metrics.stale}</div>
				</div>
				<div className="rounded-md border bg-background px-3 py-2">
					<div className="text-xs text-muted-foreground">Project</div>
					<div className="mt-1 truncate font-mono text-sm font-medium">
						{activeProjectId}
					</div>
				</div>
			</div>

			<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
				<FactorySearch
					value={query}
					placeholder="Search dialogues"
					onChange={setQuery}
				/>
				<Button
					type="button"
					variant={needsMineOnly ? "secondary" : "outline"}
					onClick={() => setNeedsMineOnly((value) => !value)}
				>
					<UserRound className="size-4" />
					Needs MY reply
				</Button>
				<Button
					type="button"
					variant="outline"
					onClick={() =>
						setSortDirection((value) => (value === "newest" ? "oldest" : "newest"))
					}
				>
					<ArrowUpDown className="size-4" />
					{sortDirection === "newest" ? "Newest first" : "Oldest first"}
				</Button>
				<Button type="button" variant="outline" onClick={() => setDrawerOpen(true)}>
					<Filter className="size-4" />
					Filters
				</Button>
			</div>

			<div className="overflow-hidden rounded-md border bg-background">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Dialogue</TableHead>
							<TableHead>Author</TableHead>
							<TableHead>Surface</TableHead>
							<TableHead>State</TableHead>
							<TableHead>Last message</TableHead>
							<TableHead>Last activity</TableHead>
							<TableHead>Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((dialogue) => {
							const author = primaryAuthor(dialogue);
							const hasMineAttention =
								needsMineOnly && dialogue.is_mine && dialogue.state === "needs_reply";
							return (
								<TableRow
									key={`${dialogue.surface}-${dialogue.id}`}
									role="button"
									tabIndex={0}
									className={cn(
										"cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
										dialogue.archived && "opacity-70",
									)}
									onClick={() => openDialogue(dialogue)}
									onKeyDown={(event) => handleRowKeyDown(event, dialogue)}
								>
									<TableCell className="max-w-xs whitespace-normal">
										<div className="font-medium">{dialogue.title}</div>
										<div className="mt-1 font-mono text-xs text-muted-foreground">
											{dialogue.id.slice(0, 8)}
										</div>
										{dialogue.stale_state_notice && (
											<StaleStateNotice notice={dialogue.stale_state_notice} />
										)}
									</TableCell>
									<TableCell className="max-w-48">
										<AuthorChip attribution={author} />
									</TableCell>
									<TableCell className="capitalize">
										{surfaceLabel(dialogue.surface)}
									</TableCell>
									<TableCell>
										<DialogueAttentionBadge
											state={dialogue.state}
											hasMineAttention={hasMineAttention}
										/>
									</TableCell>
									<TableCell className="max-w-md whitespace-normal text-sm">
										{dialogue.last_message_preview || "No messages recorded"}
									</TableCell>
									<TableCell className="text-sm text-muted-foreground">
										{formatDate(dialogue.last_activity_at)}
									</TableCell>
									<TableCell>
										<div
											className="flex flex-wrap gap-1.5"
											onClick={(event) => event.stopPropagation()}
											onKeyDown={(event) => event.stopPropagation()}
										>
											<Button
												type="button"
												size="xs"
												variant="outline"
												onClick={() => runAction(resumeMutation, dialogue)}
											>
												<RotateCcw className="size-3.5" />
												Resume
											</Button>
											{dialogue.state === "shelved" ? (
												<Button
													type="button"
													size="xs"
													variant="outline"
													onClick={() => runAction(unshelveMutation, dialogue)}
												>
													<Undo2 className="size-3.5" />
													Unshelve
												</Button>
											) : (
												<Button
													type="button"
													size="xs"
													variant="outline"
													onClick={() => runAction(shelveMutation, dialogue)}
												>
													Shelve
												</Button>
											)}
											<Button
												type="button"
												size="xs"
												variant="ghost"
												onClick={() => runAction(archiveMutation, dialogue)}
											>
												<Archive className="size-3.5" />
												Archive
											</Button>
										</div>
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
				{listQuery.isLoading && (
					<div className="flex items-center gap-2 border-t p-4 text-sm">
						<LoadingDots />
					</div>
				)}
				{!listQuery.isLoading && rows.length === 0 && (
					<div className="flex items-center gap-2 border-t p-4 text-sm text-muted-foreground">
						<Search className="size-4" />
						No dialogues match this filter.
					</div>
				)}
			</div>

			<Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
				<SheetContent className="w-[26rem] sm:max-w-[26rem]">
					<SheetHeader>
						<SheetTitle>Filter and sort</SheetTitle>
						<SheetDescription>
							{[
								stateFilter === "all" ? null : "state",
								includeArchived ? "archive" : null,
								needsMineOnly ? "mine" : null,
							].filter(Boolean).length || 0}{" "}
							active - affects {rows.length} rows
						</SheetDescription>
					</SheetHeader>
					<div className="space-y-6 px-4 pb-4">
						<div>
							<div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
								State
							</div>
							<div className="flex flex-wrap gap-2">
								{STATE_OPTIONS.map((option) => (
									<Button
										key={option.value}
										type="button"
										size="sm"
										variant={stateFilter === option.value ? "secondary" : "outline"}
										onClick={() => setStateFilter(option.value)}
									>
										{option.label}
									</Button>
								))}
							</div>
						</div>
						<div>
							<div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
								Mine
							</div>
							<Button
								type="button"
								size="sm"
								variant={needsMineOnly ? "secondary" : "outline"}
								onClick={() => setNeedsMineOnly((value) => !value)}
							>
								<UserRound className="size-4" />
								Needs MY reply
							</Button>
						</div>
						<div>
							<div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
								Archive
							</div>
							<label className="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={includeArchived}
									onChange={(event) => setIncludeArchived(event.target.checked)}
								/>
								Show abandoned and resolved dialogues
							</label>
						</div>
						<div>
							<div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
								Sort
							</div>
							<div className="flex flex-wrap gap-2">
								<Button
									type="button"
									size="sm"
									variant={sortDirection === "newest" ? "secondary" : "outline"}
									onClick={() => setSortDirection("newest")}
								>
									Newest first
								</Button>
								<Button
									type="button"
									size="sm"
									variant={sortDirection === "oldest" ? "secondary" : "outline"}
									onClick={() => setSortDirection("oldest")}
								>
									Oldest first
								</Button>
							</div>
						</div>
						<div className="flex justify-end gap-2 border-t pt-4">
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									setStateFilter("all");
									setIncludeArchived(false);
									setNeedsMineOnly(false);
									setSortDirection("newest");
								}}
							>
								Clear
							</Button>
							<Button type="button" onClick={() => setDrawerOpen(false)}>
								Apply
							</Button>
						</div>
					</div>
				</SheetContent>
			</Sheet>

			<div className="flex items-center gap-2 text-xs text-muted-foreground">
				<MessageSquare className="size-3.5" />
				Archived and resolved dialogues stay available when Archive is on.
			</div>
		</div>
	);
}
