import { createFileRoute } from "@tanstack/react-router";
import { MarkdownDocumentView } from "../../components/MarkdownDocumentView/MarkdownDocumentView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/foundations/$foundationId/",
)({
	validateSearch: (search) => ({
		path: typeof search.path === "string" ? search.path : undefined,
		label: typeof search.label === "string" ? search.label : undefined,
	}),
	component: FoundationDocumentPage,
});

function fallbackFoundationPath(foundationId: string): string {
	const normalized = foundationId.replace(/[^A-Za-z0-9_.-]+/g, "-") || "INDEX";
	if (normalized.endsWith(".md")) return normalized;
	if (normalized.toLowerCase() === "index") {
		return "projects/software-factory/foundations/INDEX.md";
	}
	return `projects/software-factory/foundations/${normalized}.md`;
}

function FoundationDocumentPage() {
	const { foundationId } = Route.useParams();
	const search = Route.useSearch();
	const path = search.path || fallbackFoundationPath(foundationId);
	const label = search.label || foundationId;

	return (
		<MarkdownDocumentView
			title={label}
			description="Foundation viewer"
			path={path}
			emptyTitle="Foundation content not found"
			emptyBody="The cockpit opened the foundation viewer, but this reference does not currently resolve to markdown content."
		/>
	);
}
