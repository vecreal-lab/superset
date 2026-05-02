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
import { ArrowRight, MessageSquare } from "lucide-react";
import { FactorySection, formatDate } from "../FactoryView";
import {
	useDialogueAttentionCounts,
	type DialogueRecord,
} from "../../hooks/useDialogueAttentionCounts";

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

function routeForSurface(surface: string): string {
	return SURFACE_ROUTES[surface] || "/factory/dialogues";
}

export function HomePriorityPanel() {
	const { counts, isLoading } = useDialogueAttentionCounts();
	const items = counts.items;

	return (
		<FactorySection
			title="Priority Dialogues"
			description="High-attention LDP threads for the active project: needs reply, awaiting commit, and awaiting confirmation."
			className="overflow-hidden"
		>
			{isLoading ? (
				<div className="text-sm text-muted-foreground">Loading dialogue attention...</div>
			) : items.length === 0 ? (
				<div className="flex items-center gap-3 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
					<MessageSquare className="size-4" />
					No high-attention dialogues for this project.
				</div>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Surface</TableHead>
							<TableHead>State</TableHead>
							<TableHead>Last message</TableHead>
							<TableHead>Last activity</TableHead>
							<TableHead>Target</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{items.map((item: DialogueRecord) => (
							<TableRow key={`${item.surface}-${item.id}`}>
								<TableCell className="capitalize">
									{surfaceLabel(item.surface)}
								</TableCell>
								<TableCell>
									<Badge variant="secondary" className="capitalize">
										{stateLabel(item.state)}
									</Badge>
								</TableCell>
								<TableCell className="max-w-md whitespace-normal text-sm">
									{item.last_message_preview || item.title}
								</TableCell>
								<TableCell className="text-sm text-muted-foreground">
									{formatDate(item.last_activity_at)}
								</TableCell>
								<TableCell>
									<Button asChild size="sm" variant="outline">
										<a href={`#${routeForSurface(item.surface)}`}>
											Open
											<ArrowRight className="size-4" />
										</a>
									</Button>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</FactorySection>
	);
}
