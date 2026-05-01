import { Badge } from "@superset/ui/badge";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	DEFAULT_ACTIVE_PROJECT_ID,
	useActiveProjectId,
	useSetActiveProjectId,
} from "renderer/stores/active-project";
import type { FactoryRow } from "../../../FactoryView";

const SELECTABLE_NODE_TYPES = new Set(["factory_infrastructure", "product"]);

function dataString(row: FactoryRow, key: string): string | null {
	const value = row.data[key];
	return typeof value === "string" && value ? value : null;
}

function dataNumber(row: FactoryRow, key: string): number {
	const value = row.data[key];
	return typeof value === "number" ? value : Number(value || 1000);
}

export function ProjectSwitcher() {
	const activeProjectId = useActiveProjectId();
	const setActiveProjectId = useSetActiveProjectId();
	const projects = electronTrpc.factory.dataset.useQuery(
		{ dataset: "projects" },
		{ refetchInterval: 10000 },
	);
	const options = (projects.data || [])
		.filter((row: FactoryRow) =>
			SELECTABLE_NODE_TYPES.has(dataString(row, "node_type") || ""),
		)
		.filter((row: FactoryRow) => dataString(row, "project_id"))
		.sort((a: FactoryRow, b: FactoryRow) => {
			const order = dataNumber(a, "display_order") - dataNumber(b, "display_order");
			return order || a.title.localeCompare(b.title);
		});
	const value = options.some(
		(row: FactoryRow) => dataString(row, "project_id") === activeProjectId,
	)
		? activeProjectId
		: DEFAULT_ACTIVE_PROJECT_ID;

	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between gap-2">
				<label
					htmlFor="factory-project-switcher"
					className="text-xs font-medium text-muted-foreground"
				>
					Project
				</label>
				<Badge variant="outline" className="px-1.5 py-0 text-[10px]">
					active
				</Badge>
			</div>
			<select
				id="factory-project-switcher"
				value={value}
				onChange={(event) => setActiveProjectId(event.target.value)}
				className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground outline-none focus:border-ring"
			>
				{options.length === 0 ? (
					<option value={DEFAULT_ACTIVE_PROJECT_ID}>Software Factory</option>
				) : (
					options.map((row: FactoryRow) => {
						const projectId = dataString(row, "project_id") || row.id;
						return (
							<option key={projectId} value={projectId}>
								{row.title}
							</option>
						);
					})
				)}
			</select>
		</div>
	);
}
