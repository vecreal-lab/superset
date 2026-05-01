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
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	DocumentSheet,
	FactoryPage,
	FactorySearch,
	SourceButton,
	type FactoryRow,
} from "../components/FactoryView";

export const Route = createFileRoute("/_authenticated/_dashboard/factory/roles/")({
	component: RolesPage,
});

function text(value: unknown, fallback = "Not declared"): string {
	return typeof value === "string" && value.trim() ? value : fallback;
}

function RolesPage() {
	const [query, setQuery] = useState("");
	const [providerFilter, setProviderFilter] = useState("all");
	const [reasoningFilter, setReasoningFilter] = useState("all");
	const [selectedSource, setSelectedSource] = useState<string | null>(null);
	const roles = electronTrpc.factory.dataset.useQuery(
		{ dataset: "roles" },
		{ refetchInterval: 5000 },
	);
	const rows = roles.data || [];
	const providers = useMemo(
		() => ["all", ...new Set(rows.map((row: FactoryRow) => text(row.data.provider)))],
		[rows],
	);
	const reasoningLevels = useMemo(
		() => [
			"all",
			...new Set(rows.map((row: FactoryRow) => text(row.data.reasoning_level, "default"))),
		],
		[rows],
	);
	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return rows.filter((row: FactoryRow) => {
			const provider = text(row.data.provider);
			const reasoning = text(row.data.reasoning_level, "default");
			if (providerFilter !== "all" && provider !== providerFilter) return false;
			if (reasoningFilter !== "all" && reasoning !== reasoningFilter) return false;
			if (!needle) return true;
			return `${row.id} ${row.title} ${row.data.purpose} ${row.data.what_it_owns}`
				.toLowerCase()
				.includes(needle);
		});
	}, [providerFilter, query, reasoningFilter, rows]);

	return (
		<FactoryPage
			title="Role Catalog"
			description="Canonical factory roles, provider policy, prompt templates, owned surfaces, verification duties, and escalation boundaries."
			actions={
				<div className="w-80">
					<FactorySearch value={query} placeholder="Search roles" onChange={setQuery} />
				</div>
			}
		>
			<div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
				<div className="mb-4 flex flex-wrap gap-2">
					{providers.map((provider) => (
						<Button
							key={provider}
							size="sm"
							variant={providerFilter === provider ? "secondary" : "outline"}
							onClick={() => setProviderFilter(provider)}
						>
							{provider}
						</Button>
					))}
				</div>
				<div className="mb-4 flex flex-wrap gap-2">
					{reasoningLevels.map((reasoning) => (
						<Button
							key={reasoning}
							size="sm"
							variant={reasoningFilter === reasoning ? "secondary" : "outline"}
							onClick={() => setReasoningFilter(reasoning)}
						>
							{reasoning}
						</Button>
					))}
				</div>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Role</TableHead>
							<TableHead>Purpose</TableHead>
							<TableHead>Provider</TableHead>
							<TableHead>Owns / verifies</TableHead>
							<TableHead>Send-back / escalation</TableHead>
							<TableHead>Prompt</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{filtered.map((row: FactoryRow) => (
							<TableRow key={row.id}>
								<TableCell className="max-w-52 whitespace-normal">
									<div className="font-medium">{row.title}</div>
									<div className="font-mono text-xs text-muted-foreground">{row.id}</div>
								</TableCell>
								<TableCell className="max-w-sm whitespace-normal text-sm">
									{text(row.data.purpose)}
								</TableCell>
								<TableCell className="max-w-52 whitespace-normal">
									<div className="flex flex-col items-start gap-1">
										<Badge variant="outline">{text(row.data.provider)}</Badge>
										<span className="font-mono text-xs text-muted-foreground">
											{text(row.data.model, "default model")}
										</span>
										<span className="font-mono text-xs text-muted-foreground">
											{text(row.data.reasoning_level, "default reasoning")}
										</span>
									</div>
								</TableCell>
								<TableCell className="max-w-sm whitespace-normal text-xs">
									<div>{text(row.data.what_it_owns)}</div>
									<div className="mt-2 text-muted-foreground">
										{text(row.data.must_verify)}
									</div>
								</TableCell>
								<TableCell className="max-w-sm whitespace-normal text-xs">
									<div>{text(row.data.sends_back_when)}</div>
									<div className="mt-2 text-muted-foreground">
										{text(row.data.escalates_when)}
									</div>
								</TableCell>
								<TableCell className="max-w-sm">
									<div className="flex flex-col items-start gap-1">
										<SourceButton
											path={row.source_relative_path}
											onOpen={setSelectedSource}
										>
											Registry entry
										</SourceButton>
										{typeof row.data.prompt_path === "string" && (
											<SourceButton
												path={row.data.prompt_path}
												onOpen={setSelectedSource}
											>
												Prompt template
											</SourceButton>
										)}
									</div>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
			<DocumentSheet
				path={selectedSource}
				title="Role source"
				onOpenChange={(open) => !open && setSelectedSource(null)}
			/>
		</FactoryPage>
	);
}
