import { Button } from "@superset/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer/MarkdownRenderer";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	FactoryPage,
	FactorySearch,
	SourceButton,
	formatDate,
	type FactoryRow,
} from "../components/FactoryView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/foundations/",
)({
	component: FoundationsPage,
});

function FoundationsPage() {
	const [query, setQuery] = useState("");
	const foundations = electronTrpc.factory.dataset.useQuery(
		{ dataset: "foundations" },
		{ refetchInterval: 5000 },
	);
	const decisions = electronTrpc.factory.dataset.useQuery(
		{ dataset: "decisions" },
		{ refetchInterval: 5000 },
	);
	const documents = useMemo(
		() =>
			[...(foundations.data || []), ...(decisions.data || [])].sort(
				(a: FactoryRow, b: FactoryRow) =>
					a.source_relative_path.localeCompare(b.source_relative_path),
			),
		[foundations.data, decisions.data],
	);
	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return documents;
		return documents.filter((row: FactoryRow) =>
			`${row.title} ${row.source_relative_path}`.toLowerCase().includes(needle),
		);
	}, [documents, query]);
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	useEffect(() => {
		if (!selectedPath && filtered[0]) setSelectedPath(filtered[0].source_relative_path);
	}, [filtered, selectedPath]);
	const selectedDocument = electronTrpc.factory.document.useQuery(
		{ path: selectedPath || "" },
		{ enabled: !!selectedPath },
	);
	const references = useMemo(() => {
		const content = selectedDocument.data?.content || "";
		const matches = [...content.matchAll(/\(([^)]+\.md)\)/g)]
			.map((match) => match[1])
			.filter(Boolean)
			.map((value) => value.replace(/^\/+/, ""));
		return [...new Set(matches)].slice(0, 12);
	}, [selectedDocument.data?.content]);

	return (
		<FactoryPage
			title="Foundation Viewer"
			description="Shared and project foundations, decisions, and intake references rendered inline from canonical repo files."
		>
			<div className="grid min-h-0 flex-1 grid-cols-[20rem_1fr] overflow-hidden">
				<aside className="flex min-h-0 flex-col border-r">
					<div className="border-b p-3">
						<FactorySearch
							value={query}
							placeholder="Search foundations"
							onChange={setQuery}
						/>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto p-2">
						{filtered.map((row: FactoryRow) => (
							<Button
								key={row.source_relative_path}
								type="button"
								variant={
									row.source_relative_path === selectedPath ? "secondary" : "ghost"
								}
								className="mb-1 h-auto w-full justify-start px-2 py-2 text-left"
								onClick={() => setSelectedPath(row.source_relative_path)}
							>
								<span className="min-w-0">
									<span className="block truncate text-sm">{row.title}</span>
									<span className="block truncate font-mono text-xs text-muted-foreground">
										{row.source_relative_path}
									</span>
								</span>
							</Button>
						))}
					</div>
				</aside>
				<main className="min-h-0 overflow-y-auto px-8 py-6">
					{selectedDocument.data ? (
						<div className="space-y-4">
							<div className="flex items-start justify-between gap-4 border-b pb-4">
								<div className="min-w-0">
									<h2 className="truncate text-xl font-semibold">
										{selectedDocument.data.source_relative_path}
									</h2>
									<p className="mt-1 text-sm text-muted-foreground">
										Modified {formatDate(selectedDocument.data.modified_at)} ·{" "}
										{selectedDocument.data.bytes} bytes
									</p>
								</div>
							</div>
							<MarkdownRenderer
								content={selectedDocument.data.content}
								className="h-auto overflow-visible"
							/>
							{references.length > 0 && (
								<div className="rounded-md border p-3">
									<div className="mb-2 text-sm font-medium">Referenced artifacts</div>
									<div className="flex flex-col items-start gap-1">
										{references.map((reference) => (
											<SourceButton
												key={reference}
												path={reference}
												onOpen={setSelectedPath}
											/>
										))}
									</div>
								</div>
							)}
						</div>
					) : (
						<div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
							Select a foundation or decision artifact.
						</div>
					)}
				</main>
			</div>
		</FactoryPage>
	);
}
