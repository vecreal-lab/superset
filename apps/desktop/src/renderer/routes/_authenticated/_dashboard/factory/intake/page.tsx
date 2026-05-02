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
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { toast } from "@superset/ui/sonner";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useActiveProjectId } from "renderer/stores/active-project";
import {
	EmptyFactoryState,
	FactoryPage,
	FactorySearch,
	StatusBadge,
	formatDate,
} from "../components/FactoryView";

type IntakeStatus =
	| "pending"
	| "digesting"
	| "digested"
	| "propagated"
	| "shelved"
	| "declined";

type SortKey =
	| "title"
	| "type"
	| "project"
	| "status"
	| "last_activity"
	| "propagation_targets";

type SortDirection = "asc" | "desc";

interface IntakeListItem {
	id: string;
	project_id: string;
	type: string;
	title: string;
	slug: string;
	status: IntakeStatus;
	folder_relative_path: string;
	summary_preview?: string;
	ingested_at?: string;
	last_activity_at?: string;
	propagation_target_count: number;
}

const DEFAULT_STATUSES: IntakeStatus[] = [
	"pending",
	"digesting",
	"digested",
	"shelved",
	"declined",
];

const ALL_STATUSES: IntakeStatus[] = [
	"pending",
	"digesting",
	"digested",
	"propagated",
	"shelved",
	"declined",
];

export const Route = createFileRoute("/_authenticated/_dashboard/factory/intake/")({
	validateSearch: (search) => ({
		project: typeof search.project === "string" ? search.project : undefined,
		type: typeof search.type === "string" ? search.type : undefined,
		status: typeof search.status === "string" ? search.status : undefined,
		search: typeof search.search === "string" ? search.search : undefined,
		sort:
			typeof search.sort === "string" && isSortKey(search.sort)
				? search.sort
				: "last_activity",
		dir: search.dir === "asc" ? "asc" : "desc",
	}),
	component: IntakeListPage,
});

function isSortKey(value: string): value is SortKey {
	return [
		"title",
		"type",
		"project",
		"status",
		"last_activity",
		"propagation_targets",
	].includes(value);
}

function parseList(value: string | undefined) {
	return value
		? value
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean)
		: [];
}

function parseStatusList(value: string | undefined): IntakeStatus[] {
	const parsed = parseList(value).filter((status): status is IntakeStatus =>
		ALL_STATUSES.includes(status as IntakeStatus),
	);
	return parsed.length ? parsed : DEFAULT_STATUSES;
}

function serializeList(values: string[]) {
	return values.length ? values.join(",") : undefined;
}

function compareText(left: string, right: string, direction: SortDirection) {
	const result = left.localeCompare(right);
	return direction === "asc" ? result : -result;
}

function compareNumber(left: number, right: number, direction: SortDirection) {
	const result = left - right;
	return direction === "asc" ? result : -result;
}

function latestActivity(item: IntakeListItem) {
	return item.last_activity_at || item.ingested_at || "";
}

function matchesSearch(item: IntakeListItem, query: string) {
	if (!query.trim()) {
		return true;
	}
	const needle = query.trim().toLowerCase();
	return `${item.title} ${item.type} ${item.slug} ${item.summary_preview || ""} ${item.folder_relative_path}`
		.toLowerCase()
		.includes(needle);
}

function IntakeListPage() {
	const activeProjectId = useActiveProjectId();
	const search = Route.useSearch();
	const navigate = useNavigate();
	const intakeQuery = electronTrpc.factory.intake.list.useQuery(
		{ include_propagated: true },
		{ refetchInterval: 5000 },
	);

	const projectFilter = search.project || activeProjectId;
	const typeFilters = parseList(search.type);
	const statusFilters = parseStatusList(search.status);
	const query = search.search || "";
	const sortKey: SortKey = isSortKey(search.sort) ? search.sort : "last_activity";
	const sortDirection: SortDirection = search.dir === "asc" ? "asc" : "desc";

	const allItems: IntakeListItem[] = intakeQuery.data || [];
	const projects = useMemo(
		() => [...new Set([activeProjectId, ...allItems.map((item) => item.project_id)])].sort(),
		[activeProjectId, allItems],
	);
	const types = useMemo(
		() => [...new Set(allItems.map((item) => item.type))].sort(),
		[allItems],
	);

	const filteredItems = useMemo(() => {
		const rows = allItems
			.filter((item) =>
				projectFilter === "__all" ? true : item.project_id === projectFilter,
			)
			.filter((item) =>
				typeFilters.length ? typeFilters.includes(item.type) : true,
			)
			.filter((item) => statusFilters.includes(item.status))
			.filter((item) => matchesSearch(item, query));

		return rows.sort((left, right) => {
			if (sortKey === "title") {
				return compareText(left.title, right.title, sortDirection);
			}
			if (sortKey === "type") {
				return compareText(left.type, right.type, sortDirection);
			}
			if (sortKey === "project") {
				return compareText(left.project_id, right.project_id, sortDirection);
			}
			if (sortKey === "status") {
				return compareText(left.status, right.status, sortDirection);
			}
			if (sortKey === "propagation_targets") {
				return compareNumber(
					left.propagation_target_count,
					right.propagation_target_count,
					sortDirection,
				);
			}
			return compareText(latestActivity(left), latestActivity(right), sortDirection);
		});
	}, [allItems, projectFilter, query, sortDirection, sortKey, statusFilters, typeFilters]);

	const updateSearch = (next: Partial<typeof search>) =>
		navigate({
			to: "/factory/intake",
			search: {
				...search,
				...next,
			},
			replace: true,
		});

	const toggleStatus = (status: IntakeStatus) => {
		const next = statusFilters.includes(status)
			? statusFilters.filter((candidate) => candidate !== status)
			: [...statusFilters, status];
		updateSearch({ status: serializeList(next) });
	};

	const toggleType = (type: string) => {
		const next = typeFilters.includes(type)
			? typeFilters.filter((candidate) => candidate !== type)
			: [...typeFilters, type];
		updateSearch({ type: serializeList(next) });
	};

	const toggleSort = (key: SortKey) => {
		updateSearch({
			sort: key,
			dir: sortKey === key && sortDirection === "desc" ? "asc" : "desc",
		});
	};

	const sortIcon = (key: SortKey) => {
		if (sortKey !== key) {
			return null;
		}
		return sortDirection === "asc" ? (
			<ArrowUp className="size-3" />
		) : (
			<ArrowDown className="size-3" />
		);
	};

	return (
		<FactoryPage
			title="Intake"
			description="Cross-project Layer 2 intake queue for workshops, research notes, founder brain-dumps, customer pain, competitor news, and other upstream evidence."
			actions={
				<Button
					size="sm"
					onClick={() => toast.info("Composer ships in WO-C21.5.")}
				>
					<Plus className="size-4" />
					New intake
				</Button>
			}
		>
			<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-6">
				<div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(12rem,0.45fr)]">
					<FactorySearch
						value={query}
						placeholder="Search title, type, slug, summary, or path"
						onChange={(value) => updateSearch({ search: value || undefined })}
					/>
					<select
						value={projectFilter}
						className="h-9 rounded-md border bg-background px-3 text-sm"
						onChange={(event) => updateSearch({ project: event.target.value })}
					>
						<option value="__all">All projects</option>
						{projects.map((projectId) => (
							<option key={projectId} value={projectId}>
								{projectId}
							</option>
						))}
					</select>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<span className="text-xs font-medium text-muted-foreground">Type</span>
					{types.length === 0 ? (
						<Badge variant="outline">none yet</Badge>
					) : (
						types.map((type) => (
							<Button
								key={type}
								size="xs"
								variant={typeFilters.includes(type) ? "secondary" : "outline"}
								onClick={() => toggleType(type)}
							>
								{type}
							</Button>
						))
					)}
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<span className="text-xs font-medium text-muted-foreground">Status</span>
					{ALL_STATUSES.map((status) => (
						<Button
							key={status}
							size="xs"
							variant={statusFilters.includes(status) ? "secondary" : "outline"}
							onClick={() => toggleStatus(status)}
						>
							{status}
						</Button>
					))}
				</div>

				<div className="min-h-0 flex-1 overflow-auto rounded-md border">
					{intakeQuery.isLoading ? (
						<div className="p-6 text-sm text-muted-foreground">Loading intakes...</div>
					) : intakeQuery.isError ? (
						<div className="p-6 text-sm text-destructive">
							{intakeQuery.error.message}
						</div>
					) : filteredItems.length === 0 ? (
						<div className="p-4">
							<EmptyFactoryState
								title="No intakes yet"
								body="Create a new intake to capture workshop notes, articles, customer pain, competitor signals, or founder brain-dumps. The composer lands in WO-C21.5."
							/>
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<SortableHead onClick={() => toggleSort("title")}>
										Title {sortIcon("title")}
									</SortableHead>
									<SortableHead onClick={() => toggleSort("type")}>
										Type {sortIcon("type")}
									</SortableHead>
									<SortableHead onClick={() => toggleSort("project")}>
										Project {sortIcon("project")}
									</SortableHead>
									<SortableHead onClick={() => toggleSort("status")}>
										Status {sortIcon("status")}
									</SortableHead>
									<SortableHead onClick={() => toggleSort("last_activity")}>
										Last activity {sortIcon("last_activity")}
									</SortableHead>
									<SortableHead onClick={() => toggleSort("propagation_targets")}>
										Propagation {sortIcon("propagation_targets")}
									</SortableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filteredItems.map((item) => (
									<TableRow
										key={item.id}
										className="cursor-pointer"
										onClick={() =>
											navigate({
												to: "/factory/intake/$intakeId",
												params: { intakeId: encodeURIComponent(item.id) },
												search: {
													tab: "SUMMARY",
													dialogueId: undefined,
													planTarget: undefined,
												},
											})
										}
									>
										<TableCell className="max-w-md">
											<div className="truncate font-medium">{item.title}</div>
											<div className="truncate font-mono text-xs text-muted-foreground">
												{item.folder_relative_path}
											</div>
										</TableCell>
										<TableCell>
											<Badge variant="outline">{item.type}</Badge>
										</TableCell>
										<TableCell className="font-mono text-xs">
											{item.project_id}
										</TableCell>
										<TableCell>
											<StatusBadge status={item.status} />
										</TableCell>
										<TableCell>{formatDate(latestActivity(item))}</TableCell>
										<TableCell>{item.propagation_target_count}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</div>
			</div>
		</FactoryPage>
	);
}

function SortableHead({
	children,
	onClick,
}: {
	children: ReactNode;
	onClick: () => void;
}) {
	return (
		<TableHead>
			<button
				type="button"
				className="inline-flex items-center gap-1 text-left text-xs font-medium"
				onClick={onClick}
			>
				{children}
			</button>
		</TableHead>
	);
}
