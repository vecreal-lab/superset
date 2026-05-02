import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { cn } from "@superset/ui/utils";
import { Archive, RotateCcw, Search, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useActiveProjectId } from "renderer/stores/active-project";
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

function stateLabel(state: string): string {
	return state.replace(/_/g, " ");
}

function surfaceLabel(surface: string): string {
	return surface.replace(/[-_/]+/g, " ");
}

function stateTone(state: DialogueState): "secondary" | "outline" | "destructive" {
	if (state === "abandoned") return "destructive";
	if (
		state === "needs_reply" ||
		state === "awaiting_commit" ||
		state === "awaiting_confirmation"
	) {
		return "secondary";
	}
	return "outline";
}

export function LDPInbox() {
	const activeProjectId = useActiveProjectId();
	const utils = electronTrpc.useUtils();
	const [query, setQuery] = useState("");
	const [stateFilter, setStateFilter] = useState<"all" | DialogueState>("all");
	const [includeArchived, setIncludeArchived] = useState(false);
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
		return ((listQuery.data || []) as DialogueRecord[]).filter((dialogue) =>
			needle
				? `${dialogue.title} ${dialogue.surface} ${dialogue.state} ${dialogue.last_message_preview}`
						.toLowerCase()
						.includes(needle)
				: true,
		);
	}, [listQuery.data, query]);

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
			project: activeProjectId,
			surface: dialogue.surface,
			dialogueId: dialogue.id,
		});
		await refreshDialogueQueries();
	}

	return (
		<div className="space-y-4">
			<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_14rem_10rem]">
				<FactorySearch
					value={query}
					placeholder="Search dialogues"
					onChange={setQuery}
				/>
				<select
					value={stateFilter}
					onChange={(event) =>
						setStateFilter(event.target.value as "all" | DialogueState)
					}
					className="h-10 rounded-md border bg-background px-2 text-sm text-foreground outline-none focus:border-ring"
				>
					{STATE_OPTIONS.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
				<label className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm">
					<input
						type="checkbox"
						checked={includeArchived}
						onChange={(event) => setIncludeArchived(event.target.checked)}
					/>
					Archived
				</label>
			</div>
			<div className="overflow-hidden rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Dialogue</TableHead>
							<TableHead>Surface</TableHead>
							<TableHead>State</TableHead>
							<TableHead>Last message</TableHead>
							<TableHead>Last activity</TableHead>
							<TableHead>Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((dialogue) => (
							<TableRow
								key={`${dialogue.surface}-${dialogue.id}`}
								className={cn(dialogue.archived && "opacity-70")}
							>
								<TableCell className="max-w-xs whitespace-normal">
									<div className="font-medium">{dialogue.title}</div>
									<div className="mt-1 font-mono text-xs text-muted-foreground">
										{dialogue.id.slice(0, 8)}
									</div>
								</TableCell>
								<TableCell className="capitalize">
									{surfaceLabel(dialogue.surface)}
								</TableCell>
								<TableCell>
									<Badge variant={stateTone(dialogue.state)} className="capitalize">
										{stateLabel(dialogue.state)}
									</Badge>
								</TableCell>
								<TableCell className="max-w-md whitespace-normal text-sm">
									{dialogue.last_message_preview || "No messages recorded"}
								</TableCell>
								<TableCell className="text-sm text-muted-foreground">
									{formatDate(dialogue.last_activity_at)}
								</TableCell>
								<TableCell>
									<div className="flex flex-wrap gap-1.5">
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
						))}
					</TableBody>
				</Table>
				{!listQuery.isLoading && rows.length === 0 && (
					<div className="flex items-center gap-2 border-t p-4 text-sm text-muted-foreground">
						<Search className="size-4" />
						No dialogues match this filter.
					</div>
				)}
			</div>
		</div>
	);
}
