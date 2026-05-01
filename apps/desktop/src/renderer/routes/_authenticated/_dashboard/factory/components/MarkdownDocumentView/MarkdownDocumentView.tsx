import { MarkdownRenderer } from "renderer/components/MarkdownRenderer/MarkdownRenderer";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { FactoryPage, formatDate } from "../FactoryView";

interface MarkdownDocumentViewProps {
	title: string;
	description: string;
	path: string;
	emptyTitle: string;
	emptyBody: string;
}

export function MarkdownDocumentView({
	title,
	description,
	path,
	emptyTitle,
	emptyBody,
}: MarkdownDocumentViewProps) {
	const documentQuery = electronTrpc.factory.document.useQuery({ path });
	const content = documentQuery.data?.content.trim() || "";

	return (
		<FactoryPage title={title} description={description}>
			<div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
				{documentQuery.isLoading ? (
					<div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
						Loading {path}...
					</div>
				) : documentQuery.isError ? (
					<div className="rounded-md border border-destructive/40 p-6 text-sm">
						<div className="font-medium text-destructive">
							Could not load document
						</div>
						<p className="mt-2 text-muted-foreground">
							The cockpit expected to render <code>{path}</code>. Check that the
							file exists and stays inside the Software Factory repo.
						</p>
						<p className="mt-3 font-mono text-xs text-muted-foreground">
							{documentQuery.error.message}
						</p>
					</div>
				) : !content ? (
					<div className="rounded-md border border-dashed p-6 text-sm">
						<div className="font-medium">{emptyTitle}</div>
						<p className="mt-2 max-w-2xl text-muted-foreground">{emptyBody}</p>
						<p className="mt-3 font-mono text-xs text-muted-foreground">{path}</p>
					</div>
				) : (
					<div className="space-y-4">
						<div className="border-b pb-4">
							<p className="font-mono text-xs text-muted-foreground">
								{documentQuery.data?.source_relative_path || path}
							</p>
							{documentQuery.data && (
								<p className="mt-1 text-xs text-muted-foreground">
									Modified {formatDate(documentQuery.data.modified_at)} ·{" "}
									{documentQuery.data.bytes} bytes
								</p>
							)}
						</div>
						<MarkdownRenderer content={content} className="h-auto overflow-visible" />
					</div>
				)}
			</div>
		</FactoryPage>
	);
}
