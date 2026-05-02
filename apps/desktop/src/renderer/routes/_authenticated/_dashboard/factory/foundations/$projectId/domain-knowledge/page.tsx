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
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, RotateCw } from "lucide-react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	EmptyFactoryState,
	FactoryPage,
	StatusBadge,
	formatDate,
} from "../../../components/FactoryView";

interface DomainKnowledgeAreaSummary {
	project_id: string;
	area: string;
	label: string;
	area_relative_path: string;
	last_curated_at?: string;
	total_snippets: number;
	uncurated_snippets: number;
	snippets_since_last_curation: number;
	structured_doc_count: number;
	needs_curation: boolean;
	trigger_reasons: string[];
	next_review_due?: string;
}

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/foundations/$projectId/domain-knowledge/",
)({
	component: DomainKnowledgeListPage,
});

const decodeRouteParam = (value: string) => decodeURIComponent(value);
const encodeRouteParam = (value: string) => encodeURIComponent(value);

function triggerLabel(reasons: string[]) {
	if (!reasons.length) return "fresh";
	return reasons.map((reason) => reason.replace(/_/g, " ")).join(", ");
}

function DomainKnowledgeListPage() {
	const { projectId } = Route.useParams();
	const decodedProjectId = decodeRouteParam(projectId);
	const navigate = useNavigate();
	const query = electronTrpc.factory.domainKnowledge.list.useQuery(
		{ project_id: decodedProjectId },
		{ refetchInterval: 5000 },
	);
	const areas = (query.data || []) as DomainKnowledgeAreaSummary[];

	return (
		<FactoryPage
			title="Domain Knowledge"
			description="Project-local domain areas curated from intake snippets by DOMAIN_KNOWLEDGE_STEWARD."
			actions={
				<Button
					size="sm"
					variant="outline"
					disabled={query.isFetching}
					onClick={() => void query.refetch()}
				>
					<RotateCw className="size-4" />
					Refresh
				</Button>
			}
		>
			<div className="min-h-0 flex-1 overflow-auto p-6">
				<div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
					<Badge variant="outline">Project</Badge>
					<span className="font-mono">{decodedProjectId}</span>
				</div>

				{query.isLoading ? (
					<div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
						Loading domain knowledge areas...
					</div>
				) : query.isError ? (
					<EmptyFactoryState
						title="Domain knowledge unavailable"
						body={query.error.message}
					/>
				) : areas.length === 0 ? (
					<EmptyFactoryState
						title="No domain areas yet"
						body="Domain areas appear after intake propagation creates projects/<project>/domain-knowledge/<area>/ folders."
						sourcePath={`projects/${decodedProjectId}/domain-knowledge/`}
					/>
				) : (
					<div className="overflow-hidden rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Area</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Snippets</TableHead>
									<TableHead>Structured docs</TableHead>
									<TableHead>Last curated</TableHead>
									<TableHead>Trigger</TableHead>
									<TableHead />
								</TableRow>
							</TableHeader>
							<TableBody>
								{areas.map((area) => (
									<TableRow
										key={area.area}
										className="cursor-pointer"
										onClick={() =>
											navigate({
												to: "/factory/foundations/$projectId/domain-knowledge/$area",
												params: {
													projectId: encodeRouteParam(decodedProjectId),
													area: encodeRouteParam(area.area),
												},
											})
										}
									>
										<TableCell>
											<div className="font-medium">{area.label}</div>
											<div className="font-mono text-xs text-muted-foreground">
												{area.area_relative_path}
											</div>
										</TableCell>
										<TableCell>
											<StatusBadge
												status={area.needs_curation ? "needs curation" : "fresh"}
											/>
										</TableCell>
										<TableCell>
											{area.uncurated_snippets} uncurated / {area.total_snippets} total
										</TableCell>
										<TableCell>{area.structured_doc_count}/4</TableCell>
										<TableCell>{formatDate(area.last_curated_at)}</TableCell>
										<TableCell>{triggerLabel(area.trigger_reasons)}</TableCell>
										<TableCell className="text-right">
											<Button size="xs" variant="ghost">
												Open <ArrowRight className="size-3.5" />
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</div>
		</FactoryPage>
	);
}

