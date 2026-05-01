import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { ScrollArea } from "@superset/ui/scroll-area";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@superset/ui/sheet";
import { Textarea } from "@superset/ui/textarea";
import { cn } from "@superset/ui/utils";
import { Link } from "@tanstack/react-router";
import { FileText, Search } from "lucide-react";
import type { ReactNode } from "react";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer/MarkdownRenderer";
import { electronTrpc } from "renderer/lib/electron-trpc";

export interface FactoryRow {
	id: string;
	title: string;
	status: string | null;
	source_path: string;
	source_relative_path: string;
	modified_at: string | null;
	parse_status: "ok" | "missing" | "error";
	quality_flags: string[];
	data: Record<string, string | number | boolean | null>;
}

export interface FactoryDocumentReference {
	title: string;
	source_path: string;
	source_relative_path: string;
	modified_at: string | null;
}

interface FactoryPageProps {
	eyebrow?: string;
	title: string;
	description: string;
	actions?: ReactNode;
	children: ReactNode;
}

export function FactoryPage({
	eyebrow = "Factory",
	title,
	description,
	actions,
	children,
}: FactoryPageProps) {
	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<header className="flex items-start justify-between gap-4 border-b px-8 py-6">
				<div className="min-w-0">
					<p className="text-xs font-medium uppercase text-muted-foreground">
						{eyebrow}
					</p>
					<h1 className="mt-1 truncate text-2xl font-semibold">{title}</h1>
					<p className="mt-2 max-w-3xl text-sm text-muted-foreground">
						{description}
					</p>
				</div>
				{actions}
			</header>
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
		</div>
	);
}

export function FactorySection({
	title,
	description,
	children,
	className,
}: {
	title: string;
	description?: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section className={cn("rounded-md border", className)}>
			<div className="border-b px-4 py-3">
				<h2 className="text-sm font-medium">{title}</h2>
				{description && (
					<p className="mt-1 text-xs text-muted-foreground">{description}</p>
				)}
			</div>
			<div className="p-4">{children}</div>
		</section>
	);
}

export function EmptyFactoryState({
	title,
	body,
	sourcePath,
	onOpenSource,
}: {
	title: string;
	body: string;
	sourcePath?: string;
	onOpenSource?: (path: string) => void;
}) {
	return (
		<div className="rounded-md border border-dashed p-6 text-sm">
			<div className="font-medium">{title}</div>
			<p className="mt-2 max-w-2xl text-muted-foreground">{body}</p>
			{sourcePath && onOpenSource && (
				<Button
					className="mt-4"
					size="sm"
					variant="outline"
					onClick={() => onOpenSource(sourcePath)}
				>
					<FileText className="size-4" />
					Open source
				</Button>
			)}
		</div>
	);
}

export function StatusBadge({ status }: { status?: string | null }) {
	const normalized = (status || "unknown").toLowerCase();
	const variant =
		normalized.includes("failed") || normalized.includes("revision")
			? "destructive"
			: normalized.includes("complete") || normalized.includes("approved")
				? "secondary"
				: "outline";
	return <Badge variant={variant}>{status || "unknown"}</Badge>;
}

export function SourceButton({
	path,
	children,
	onOpen,
}: {
	path: string;
	children?: ReactNode;
	onOpen: (path: string) => void;
}) {
	return (
		<Button
			type="button"
			variant="ghost"
			size="xs"
			className="max-w-full justify-start px-1 font-mono text-xs"
			onClick={() => onOpen(path)}
		>
			<FileText className="size-3.5" />
			<span className="truncate">{children || path}</span>
		</Button>
	);
}

export function DocumentSheet({
	path,
	title,
	onOpenChange,
}: {
	path: string | null;
	title?: string;
	onOpenChange: (open: boolean) => void;
}) {
	const documentQuery = electronTrpc.factory.document.useQuery(
		{ path: path || "" },
		{ enabled: !!path },
	);
	const content = documentQuery.data?.content || "";
	const isMarkdown = (documentQuery.data?.source_relative_path || path || "").endsWith(
		".md",
	);

	return (
		<Sheet open={!!path} onOpenChange={onOpenChange}>
			<SheetContent className="w-[48rem] sm:max-w-[48rem]">
				<SheetHeader>
					<SheetTitle>{title || "Source artifact"}</SheetTitle>
					<SheetDescription className="font-mono">
						{documentQuery.data?.source_relative_path || path}
					</SheetDescription>
				</SheetHeader>
				<ScrollArea className="min-h-0 flex-1 px-4 pb-4">
					{documentQuery.isLoading ? (
						<div className="text-sm text-muted-foreground">Loading source...</div>
					) : documentQuery.isError ? (
						<div className="text-sm text-destructive">
							{documentQuery.error.message}
						</div>
					) : isMarkdown ? (
						<MarkdownRenderer content={content} className="h-auto overflow-visible" />
					) : (
						<pre className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">
							{content}
						</pre>
					)}
				</ScrollArea>
			</SheetContent>
		</Sheet>
	);
}

export function FactorySearch({
	value,
	placeholder,
	onChange,
}: {
	value: string;
	placeholder: string;
	onChange: (value: string) => void;
}) {
	return (
		<div className="relative">
			<Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
			<Input
				value={value}
				placeholder={placeholder}
				className="pl-8"
				onChange={(event) => onChange(event.target.value)}
			/>
		</div>
	);
}

export function FactoryTextarea({
	value,
	placeholder,
	onChange,
}: {
	value: string;
	placeholder: string;
	onChange: (value: string) => void;
}) {
	return (
		<Textarea
			value={value}
			placeholder={placeholder}
			className="min-h-20 text-sm"
			onChange={(event) => onChange(event.target.value)}
		/>
	);
}

export function WorkOrderLink({
	id,
	children,
}: {
	id: string;
	children?: ReactNode;
}) {
	return (
		<Link
			to="/factory/work-orders/$workOrderId"
			params={{ workOrderId: id }}
			className="font-medium underline-offset-4 hover:underline"
		>
			{children || id}
		</Link>
	);
}

export function parseShallowYaml(raw: string): Record<string, string> {
	const parsed: Record<string, string> = {};
	for (const line of raw.split(/\r?\n/)) {
		if (!line.trim() || line.trimStart().startsWith("#")) continue;
		const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
		if (!match) continue;
		const [, key, value] = match;
		parsed[key] = (value || "").replace(/^["']|["']$/g, "").trim();
	}
	return parsed;
}

export function formatRelativeSource(path: string): string {
	return path.length > 88 ? `...${path.slice(-85)}` : path;
}

export function formatDate(value?: string | null): string {
	if (!value) return "unknown";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString();
}
