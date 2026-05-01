import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	DocumentSheet,
	FactoryPage,
	FactorySearch,
	SourceButton,
	StatusBadge,
	WorkOrderLink,
	type FactoryRow,
} from "../components/FactoryView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/work-orders/",
)({
	component: WorkOrdersPage,
});

function WorkOrdersPage() {
	const [query, setQuery] = useState("");
	const [selectedSource, setSelectedSource] = useState<string | null>(null);
	const workOrders = electronTrpc.factory.dataset.useQuery(
		{ dataset: "work_orders" },
		{ refetchInterval: 5000 },
	);
	const rows = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return (workOrders.data || []).filter((row: FactoryRow) =>
			needle
				? `${row.id} ${row.title} ${row.status} ${row.source_relative_path}`
						.toLowerCase()
						.includes(needle)
				: true,
		);
	}, [query, workOrders.data]);

	return (
		<FactoryPage
			title="Work Orders"
			description="Canonical work-order queue with status, source traceability, and drilldown into runs, evidence, approvals, and attachments."
			actions={
				<div className="w-80">
					<FactorySearch
						value={query}
						placeholder="Search work orders"
						onChange={setQuery}
					/>
				</div>
			}
		>
			<div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>ID</TableHead>
							<TableHead>Title</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Variant</TableHead>
							<TableHead>Source</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((row: FactoryRow) => (
							<TableRow key={row.source_relative_path}>
								<TableCell>
									<WorkOrderLink id={row.id} />
								</TableCell>
								<TableCell className="max-w-xl whitespace-normal">
									{row.title}
								</TableCell>
								<TableCell>
									<StatusBadge status={row.status} />
								</TableCell>
								<TableCell className="font-mono text-xs">
									{row.data.pipeline_variant || "unknown"}
								</TableCell>
								<TableCell className="max-w-sm">
									<SourceButton
										path={row.source_relative_path}
										onOpen={setSelectedSource}
									/>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
			<DocumentSheet
				path={selectedSource}
				title="Work-order source"
				onOpenChange={(open) => !open && setSelectedSource(null)}
			/>
		</FactoryPage>
	);
}
