import { Button } from "@superset/ui/button";
import { ScrollArea } from "@superset/ui/scroll-area";
import { cn } from "@superset/ui/utils";
import { Boxes, Code2, FileText, Play, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";

import { MarkdownRenderer } from "renderer/components/MarkdownRenderer/MarkdownRenderer";
import { AttentionPillPreview } from "renderer/components/vecreal/AttentionPill/AttentionPill.preview";
import { AuditLogEntryPreview } from "renderer/components/vecreal/AuditLogEntry/AuditLogEntry.preview";
import { AuthorChipPreview } from "renderer/components/vecreal/AuthorChip/AuthorChip.preview";
import { BulkActionsBarPreview } from "renderer/components/vecreal/BulkActionsBar/BulkActionsBar.preview";
import { ButtonPreview } from "renderer/components/vecreal/Button/Button.preview";
import { CardPreview } from "renderer/components/vecreal/Card/Card.preview";
import { ChatTurnEntryPreview } from "renderer/components/vecreal/ChatTurnEntry/ChatTurnEntry.preview";
import { ChipPreview } from "renderer/components/vecreal/Chip/Chip.preview";
import { CitationLinkPreview } from "renderer/components/vecreal/CitationLink/CitationLink.preview";
import { DataTablePreview } from "renderer/components/vecreal/DataTable/DataTable.preview";
import { DateTimeTextPreview } from "renderer/components/vecreal/DateTimeText/DateTimeText.preview";
import { DiffBlockPreview } from "renderer/components/vecreal/DiffBlock/DiffBlock.preview";
import { EmptyStatePreview } from "renderer/components/vecreal/EmptyState/EmptyState.preview";
import { ErrorStatePreview } from "renderer/components/vecreal/ErrorState/ErrorState.preview";
import { FileCardPreview } from "renderer/components/vecreal/FileCard/FileCard.preview";
import { FilterSortDrawerPreview } from "renderer/components/vecreal/FilterSortDrawer/FilterSortDrawer.preview";
import { FormFieldPreview } from "renderer/components/vecreal/FormField/FormField.preview";
import { GateAdvancePulsePreview } from "renderer/components/vecreal/GateAdvancePulse/GateAdvancePulse.preview";
import { GateCardPreview } from "renderer/components/vecreal/GateCard/GateCard.preview";
import { IconButtonPreview } from "renderer/components/vecreal/IconButton/IconButton.preview";
import { LoadingStatePreview } from "renderer/components/vecreal/LoadingState/LoadingState.preview";
import { MediaGridPreview } from "renderer/components/vecreal/MediaGrid/MediaGrid.preview";
import { MotionPresetPreview } from "renderer/components/vecreal/MotionPreset/MotionPreset.preview";
import { OverlayPreview } from "renderer/components/vecreal/Overlay/Overlay.preview";
import { PipelineStripPreview } from "renderer/components/vecreal/PipelineStrip/PipelineStrip.preview";
import { ReferenceTreePreview } from "renderer/components/vecreal/ReferenceTree/ReferenceTree.preview";
import { SearchInputPreview } from "renderer/components/vecreal/SearchInput/SearchInput.preview";
import { StatusBadge } from "renderer/components/vecreal/StatusBadge";
import { StatusBadgePreview } from "renderer/components/vecreal/StatusBadge/StatusBadge.preview";
import { ToastNotificationPreview } from "renderer/components/vecreal/ToastNotification/ToastNotification.preview";
import { WordmarkPreview } from "renderer/components/vecreal/Wordmark/Wordmark.preview";
import { electronTrpc, type ElectronRouterOutputs } from "renderer/lib/electron-trpc";
import {
	FactoryPage,
	FactorySection,
	formatDate,
} from "renderer/routes/_authenticated/_dashboard/factory/components/FactoryView";

type DesignSystemOverview =
	ElectronRouterOutputs["factory"]["designSystem"]["overview"];
type DesignSystemFile = DesignSystemOverview["files"][number];
type DesignSystemComponent = DesignSystemOverview["components"][number];
type DesignSystemHandoff = DesignSystemOverview["handoffs"][number];

const PANEL_MAX_HEIGHT_CLASS = "max-h-[calc(100vh-11rem)]";

const COMPONENT_PREVIEWS: Record<string, ComponentType> = {
	AttentionPill: AttentionPillPreview,
	AuditLogEntry: AuditLogEntryPreview,
	AuthorChip: AuthorChipPreview,
	BulkActionsBar: BulkActionsBarPreview,
	Button: ButtonPreview,
	Card: CardPreview,
	ChatTurnEntry: ChatTurnEntryPreview,
	Chip: ChipPreview,
	CitationLink: CitationLinkPreview,
	DataTable: DataTablePreview,
	DateTimeText: DateTimeTextPreview,
	DiffBlock: DiffBlockPreview,
	EmptyState: EmptyStatePreview,
	ErrorState: ErrorStatePreview,
	FileCard: FileCardPreview,
	FilterSortDrawer: FilterSortDrawerPreview,
	FormField: FormFieldPreview,
	GateAdvancePulse: GateAdvancePulsePreview,
	GateCard: GateCardPreview,
	IconButton: IconButtonPreview,
	LoadingState: LoadingStatePreview,
	MediaGrid: MediaGridPreview,
	MotionPreset: MotionPresetPreview,
	Overlay: OverlayPreview,
	PipelineStrip: PipelineStripPreview,
	ReferenceTree: ReferenceTreePreview,
	SearchInput: SearchInputPreview,
	StatusBadge: StatusBadgePreview,
	ToastNotification: ToastNotificationPreview,
	Wordmark: WordmarkPreview,
};

function groupFiles(files: DesignSystemFile[]) {
	return {
		core: files.filter((file) => file.group === "brand_atoms" && file.kind !== "component_spec"),
		specs: files.filter((file) => file.kind === "component_spec"),
		references: files.filter((file) => file.group === "references"),
		components: files.filter((file) => file.group === "components"),
	};
}

function selectedFileLabel(file?: DesignSystemFile) {
	if (!file) return "No file selected";
	if (file.componentName) return `${file.componentName} / ${file.label}`;
	return file.label;
}

function FileBrowserTree({
	files,
	selectedPath,
	onSelect,
}: {
	files: DesignSystemFile[];
	selectedPath?: string;
	onSelect: (file: DesignSystemFile) => void;
}) {
	const grouped = groupFiles(files);
	const groups: Array<[string, DesignSystemFile[], ReactNode]> = [
		["Brand foundations", grouped.core, <ShieldCheck className="size-3.5" />],
		["Component specs", grouped.specs, <FileText className="size-3.5" />],
		["Reference HTML", grouped.references, <Boxes className="size-3.5" />],
		["Vecreal components", grouped.components, <Code2 className="size-3.5" />],
	];

	return (
		<div
			className={cn(
				"flex h-full min-h-0 flex-col overflow-hidden",
				PANEL_MAX_HEIGHT_CLASS,
			)}
			data-design-system-left-panel
		>
			<div className="border-b px-4 py-3">
				<h2 className="text-sm font-medium">Design files</h2>
				<p className="mt-1 text-xs text-muted-foreground">
					Read-only source browser for atoms and shipped components.
				</p>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto" data-design-system-left-scroll>
				<div className="grid gap-4 p-3">
					{groups.map(([label, groupFiles, icon]) => (
						<section key={label} className="grid gap-1">
							<div className="flex items-center gap-2 px-2 font-mono text-[10px] font-semibold uppercase text-muted-foreground">
								{icon}
								<span>{label}</span>
							</div>
							<div className="grid gap-0.5">
								{groupFiles.map((file) => (
									<button
										key={file.path}
										type="button"
										className={cn(
											"grid min-h-7 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border-l-[3px] px-2 py-1 text-left text-xs transition-colors",
											selectedPath === file.path
												? "border-l-[var(--accent)] bg-[var(--bg-soft)] text-[var(--text-primary)]"
												: "border-l-transparent text-muted-foreground hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
										)}
										onClick={() => onSelect(file)}
									>
										<span className="truncate">{selectedFileLabel(file)}</span>
										<span className="font-mono text-[9px] uppercase text-muted-foreground">
											{file.kind.replace(/_/g, " ")}
										</span>
									</button>
								))}
								{groupFiles.length === 0 ? (
									<p className="px-2 py-1 text-xs text-muted-foreground">None yet.</p>
								) : null}
							</div>
						</section>
					))}
				</div>
			</div>
		</div>
	);
}

function ReadOnlyViewer({ selected }: { selected?: DesignSystemFile }) {
	const readFileQuery = electronTrpc.factory.designSystem.readFile.useQuery(
		{ path: selected?.path ?? "" },
		{ enabled: Boolean(selected?.path) },
	);
	const file = readFileQuery.data;

	return (
		<FactorySection
			title={selected ? selectedFileLabel(selected) : "Source viewer"}
			description={
				selected
					? `${selected.path} - read-only`
					: "Choose a design-system file to inspect it inline."
			}
			className="min-h-0 overflow-hidden"
		>
			<div className="min-h-0">
				{!selected ? (
					<p className="text-sm text-muted-foreground">No design file selected.</p>
				) : readFileQuery.isLoading ? (
					<p className="text-sm text-muted-foreground">Loading source...</p>
				) : readFileQuery.isError ? (
					<p className="text-sm text-destructive">{readFileQuery.error.message}</p>
				) : file?.kind === "reference_html" ? (
					<iframe
						title={file.label}
						sandbox=""
						srcDoc={file.content}
						className="h-[30rem] w-full rounded-md border bg-[var(--bg-card)]"
					/>
				) : file?.kind === "brand_foundation" || file?.kind === "component_spec" ? (
					<ScrollArea className="h-[30rem] rounded-md border p-4">
						<MarkdownRenderer content={file.content} className="h-auto overflow-visible" />
					</ScrollArea>
				) : (
					<ScrollArea className="h-[30rem] rounded-md border bg-[var(--bg-soft)]">
						<pre className="m-0 whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed">
							<code>{file?.content}</code>
						</pre>
					</ScrollArea>
				)}
			</div>
		</FactorySection>
	);
}

function ComponentPreviewPanel({ component }: { component?: DesignSystemComponent }) {
	const Preview = component ? COMPONENT_PREVIEWS[component.name] : undefined;

	return (
		<FactorySection
			title={component ? `${component.name} preview` : "Component preview"}
			description={
				component?.previewPath
					? `${component.previewPath} - live render`
					: "Live preview for the selected shipped component."
			}
			className="min-h-0 overflow-hidden"
		>
			{Preview ? (
				<div
					className="min-h-[18rem] overflow-auto rounded-md bg-[var(--bg-soft)] p-4"
					data-design-system-preview={component?.name}
				>
					<Preview />
				</div>
			) : (
				<p className="text-sm text-muted-foreground">
					Select a shipped component with a preview file to render it here.
				</p>
			)}
		</FactorySection>
	);
}

function ComponentStatusBoard({
	components,
	handoffs,
	selectedComponentName,
	onSelectComponent,
	onSpawnRequest,
}: {
	components: DesignSystemComponent[];
	handoffs: DesignSystemHandoff[];
	selectedComponentName?: string;
	onSelectComponent: (component: DesignSystemComponent) => void;
	onSpawnRequest: () => void;
}) {
	const shipped = components.filter((component) => component.status === "shipped");
	const pending = handoffs.length;

	return (
		<aside
			className={cn(
				"grid min-h-0 w-[22rem] max-w-[22rem] min-w-0 content-start gap-4 overflow-x-hidden overflow-y-auto border-l bg-[var(--bg-app)] p-4",
				PANEL_MAX_HEIGHT_CLASS,
			)}
			data-design-system-component-rail
		>
			<section className="grid gap-3">
				<div>
					<h2 className="text-sm font-medium">Component status</h2>
					<p className="mt-1 text-xs text-muted-foreground">
						Component authoring pipeline snapshot.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<StatusBadge variant="success">{shipped.length} shipped</StatusBadge>
					<StatusBadge variant={pending > 0 ? "warning" : "neutral"} isLive={pending > 0}>
						{pending} handoffs
					</StatusBadge>
					<StatusBadge variant="neutral">0 needs revision</StatusBadge>
				</div>
				<div className="grid min-h-0 gap-2 pr-1" data-design-system-component-list>
					{components.map((component) => (
						<button
							key={component.name}
							type="button"
							className={cn(
								"grid min-w-0 gap-2 rounded-md border p-3 text-left text-sm transition-colors",
								selectedComponentName === component.name
									? "border-[var(--accent)] bg-[var(--bg-soft)] text-[var(--text-primary)]"
									: "hover:bg-[var(--bg-hover)]",
							)}
							data-design-system-component-row={component.name}
							onClick={() => onSelectComponent(component)}
						>
							<div className="flex min-w-0 items-center justify-between gap-2">
								<strong className="min-w-0 truncate">{component.name}</strong>
								<StatusBadge
									variant={component.status === "shipped" ? "success" : "info"}
								>
									{component.status.replace(/_/g, " ")}
								</StatusBadge>
							</div>
							<p
								className="min-w-0 truncate font-mono text-[10px] text-muted-foreground"
								title={component.folderPath}
							>
								{component.folderPath}
							</p>
						</button>
					))}
				</div>
			</section>
			<section className="grid gap-3">
				<div>
					<h2 className="text-sm font-medium">Open handoffs</h2>
					<p className="mt-1 text-xs text-muted-foreground">
						Feature WOs that need reusable component work.
					</p>
				</div>
				{handoffs.length === 0 ? (
					<p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
						No component handoffs are open.
					</p>
				) : (
					<div className="grid gap-2">
						{handoffs.map((handoff) => (
							<div key={handoff.findingId} className="rounded-md border p-3 text-sm">
								<strong>Component needed: {handoff.componentName}</strong>
								<p className="mt-1 text-muted-foreground">
									{handoff.proposedDesignIntent}
								</p>
								<p className="mt-2 font-mono text-[10px] text-muted-foreground">
									{handoff.sourceReceiptPath}
								</p>
							</div>
						))}
					</div>
				)}
			</section>
			<Button type="button" onClick={onSpawnRequest}>
				<Play className="size-4" />
				Spawn component WO
			</Button>
		</aside>
	);
}

export function DesignSystemSurface() {
	const overviewQuery = electronTrpc.factory.designSystem.overview.useQuery();
	const spawnComponentWOMutation =
		electronTrpc.factory.designSystem.spawnComponentWO.useMutation();
	const overview = overviewQuery.data;
	const defaultPath = useMemo(
		() =>
			overview?.files.find((file) => file.path.endsWith("/StatusBadge.tsx"))?.path ??
			overview?.files[0]?.path,
		[overview?.files],
	);
	const [selectedPath, setSelectedPath] = useState<string | undefined>(undefined);
	const [selectedComponentName, setSelectedComponentName] = useState<string | undefined>(
		undefined,
	);
	const selected =
		overview?.files.find((file) => file.path === (selectedPath ?? defaultPath)) ??
		overview?.files[0];
	const selectedComponent =
		overview?.components.find((component) => component.name === selectedComponentName) ??
		(selected?.componentName
			? overview?.components.find((component) => component.name === selected.componentName)
			: overview?.components.find((component) => component.name === "StatusBadge"));
	const [spawnMessage, setSpawnMessage] = useState<string | null>(null);

	return (
			<FactoryPage
			eyebrow="Component Library"
			title="Design System"
			description="Browse Vecreal atoms, shipped component code, visual references, and component-authoring status."
		>
			<div className="grid min-h-0 flex-1 grid-cols-[18rem_minmax(0,1fr)_22rem] overflow-hidden">
				<div className="min-h-0 min-w-0 overflow-hidden border-r">
					{overviewQuery.isLoading ? (
						<p className="p-4 text-sm text-muted-foreground">Loading design system...</p>
					) : overviewQuery.isError ? (
						<p className="p-4 text-sm text-destructive">{overviewQuery.error.message}</p>
					) : (
						<FileBrowserTree
							files={overview?.files ?? []}
							selectedPath={selected?.path}
							onSelect={(file) => {
								setSelectedPath(file.path);
								if (file.componentName) setSelectedComponentName(file.componentName);
							}}
						/>
					)}
				</div>
				<main className="min-h-0 overflow-y-auto p-4">
					<div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.55fr)]">
						<ReadOnlyViewer selected={selected} />
						<ComponentPreviewPanel component={selectedComponent} />
					</div>
				</main>
				<ComponentStatusBoard
					components={overview?.components ?? []}
					handoffs={overview?.handoffs ?? []}
					selectedComponentName={selectedComponent?.name}
					onSelectComponent={(component) => {
						setSelectedComponentName(component.name);
						setSelectedPath(component.previewPath ?? component.sourcePath);
					}}
					onSpawnRequest={() => {
						const componentName =
							selectedComponent?.name ?? selected?.componentName ?? "NewComponent";
						spawnComponentWOMutation.mutate(
							{
								componentName,
								intent: `Create or revise ${componentName} through component_authoring.`,
								specPaths:
									selected?.kind === "component_spec" && selected.path
										? [selected.path]
										: [],
							},
							{
								onSuccess: (response) =>
									setSpawnMessage(response.plainEnglishSummary),
								onError: (error) => setSpawnMessage(error.message),
							},
						);
					}}
				/>
			</div>
			{spawnMessage ? (
				<div className="border-t px-8 py-2 text-xs text-muted-foreground">
					{spawnMessage}
				</div>
			) : null}
		</FactoryPage>
	);
}
