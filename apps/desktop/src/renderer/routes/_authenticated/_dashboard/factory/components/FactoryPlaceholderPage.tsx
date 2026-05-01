import { electronTrpc } from "renderer/lib/electron-trpc";

type FactoryDataset =
	| "work_orders"
	| "runs"
	| "foundations"
	| "decisions"
	| "missions"
	| "roles"
	| "prompts"
	| "approvals"
	| "lessons";

interface FactoryPlaceholderPageProps {
	title: string;
	description: string;
	dataset?: FactoryDataset;
}

export function FactoryPlaceholderPage({
	title,
	description,
	dataset,
}: FactoryPlaceholderPageProps) {
	const summary = electronTrpc.factory.summary.useQuery(undefined, {
		refetchInterval: 5000,
	});
	const datasetQuery = electronTrpc.factory.dataset.useQuery(
		{ dataset: dataset ?? "work_orders" },
		{ enabled: !!dataset },
	);

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<header className="border-b px-8 py-6">
				<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					Factory
				</p>
				<h1 className="mt-1 text-2xl font-semibold">{title}</h1>
				<p className="mt-2 max-w-3xl text-sm text-muted-foreground">
					{description}
				</p>
			</header>
			<div className="flex-1 overflow-y-auto px-8 py-6">
				<div className="grid gap-4 md:grid-cols-3">
					<div className="rounded-md border p-4">
						<div className="text-xs uppercase text-muted-foreground">
							Read model
						</div>
						<div className="mt-2 text-sm">
							{summary.data?.last_indexed_at
								? `Indexed ${summary.data.last_indexed_at}`
								: summary.isLoading
									? "Indexing..."
									: "Awaiting index"}
						</div>
					</div>
					<div className="rounded-md border p-4">
						<div className="text-xs uppercase text-muted-foreground">
							Watchers
						</div>
						<div className="mt-2 text-sm">
							{summary.data?.watcher_count ?? 0} active
						</div>
					</div>
					<div className="rounded-md border p-4">
						<div className="text-xs uppercase text-muted-foreground">
							Rows
						</div>
						<div className="mt-2 text-sm">
							{dataset
								? `${datasetQuery.data?.length ?? 0} ${dataset}`
								: `${summary.data?.counts.work_orders ?? 0} work orders`}
						</div>
					</div>
				</div>
				<div className="mt-8 rounded-md border border-dashed p-6 text-sm text-muted-foreground">
					{title} rendering lands in substage 5. This shell proves route,
					navigation, and read-model plumbing before the custom cockpit views are
					built.
				</div>
			</div>
		</div>
	);
}
