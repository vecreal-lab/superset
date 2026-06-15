import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	CheckCircle2,
	Download,
	MessageSquarePlus,
	Presentation,
	RefreshCw,
	Send,
	Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useDeckSurfaceSelection } from "lib/stores/deck-surface";
import type {
	ArtifactReference,
	DeckCommentTarget,
	DeckDetail,
	DeckExportFormat,
	DeckRevisionComment,
	DeckRevisionEvent,
	DeckSlideSummary,
	DeckSummary,
} from "lib/types/factory-operator-console";

export interface DeckListViewProps {
	projectId: string;
	decks: DeckSummary[];
	isLoading?: boolean;
	isSpawning?: boolean;
	onOpenDeck: (deckId: string) => void;
	onSpawnDeck: (input: {
		title?: string;
		scope: string;
		audience?: string;
	}) => void;
	onRefresh: () => void;
}

export function DeckListView({
	projectId,
	decks,
	isLoading,
	isSpawning,
	onOpenDeck,
	onSpawnDeck,
	onRefresh,
}: DeckListViewProps) {
	const [title, setTitle] = useState("");
	const [scope, setScope] = useState("");
	const [audience, setAudience] = useState("");
	const canSpawn = scope.trim().length > 0 && !isSpawning;

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
			<header className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<div className="flex items-center gap-2 text-xs uppercase tracking-normal text-muted-foreground">
						<Presentation className="size-4" aria-hidden />
						{projectId}
					</div>
					<h1 className="mt-2 text-2xl font-semibold tracking-normal">
						Pitch decks
					</h1>
				</div>
				<Button type="button" variant="outline" size="sm" onClick={onRefresh}>
					<RefreshCw className="mr-2 size-4" aria-hidden />
					Refresh
				</Button>
			</header>

			<div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
				<section className="min-h-0 rounded-lg border border-border bg-background/50">
					<div className="flex items-center justify-between border-b border-border px-4 py-3">
						<h2 className="text-sm font-semibold tracking-normal">Deck queue</h2>
						<Badge variant="secondary">{decks.length}</Badge>
					</div>
					<div className="divide-y divide-border">
						{isLoading ? (
							<div className="px-4 py-8 text-sm text-muted-foreground">
								Loading decks...
							</div>
						) : decks.length ? (
							decks.map((deck) => (
								<button
									key={deck.deckId}
									type="button"
									className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									onClick={() => onOpenDeck(deck.deckId)}
								>
									<div className="min-w-0">
										<div className="flex flex-wrap items-center gap-2">
											<h3 className="truncate text-sm font-semibold tracking-normal">
												{deck.title}
											</h3>
											<DeckStatusBadge status={deck.status} />
										</div>
										<p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
											{deck.scope}
										</p>
										<div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
											<span>{deck.slideCount} slides</span>
											<span>{deck.ownerPath}</span>
										</div>
									</div>
									<Badge variant="outline">{deck.approvalState.deck}</Badge>
								</button>
							))
						) : (
							<div className="px-4 py-8 text-sm text-muted-foreground">
								No deck surfaces yet.
							</div>
						)}
					</div>
				</section>

				<section className="rounded-lg border border-border bg-background/50 p-4">
					<div className="flex items-center gap-2">
						<Sparkles className="size-4 text-muted-foreground" aria-hidden />
						<h2 className="text-sm font-semibold tracking-normal">
							Spawn deck
						</h2>
					</div>
					<form
						className="mt-4 flex flex-col gap-3"
						onSubmit={(event) => {
							event.preventDefault();
							if (!canSpawn) return;
							onSpawnDeck({
								title: title.trim() || undefined,
								scope: scope.trim(),
								audience: audience.trim() || undefined,
							});
						}}
					>
						<label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
							Title
							<input
								value={title}
								onChange={(event) => setTitle(event.target.value)}
								className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-ring"
								placeholder="Optional deck title"
							/>
						</label>
						<label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
							Scope
							<textarea
								value={scope}
								onChange={(event) => setScope(event.target.value)}
								className="min-h-32 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring"
								placeholder="Deck goal, source material, and decision context"
							/>
						</label>
						<label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
							Audience
							<input
								value={audience}
								onChange={(event) => setAudience(event.target.value)}
								className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-ring"
								placeholder="Operator, buyers, stakeholders"
							/>
						</label>
						<Button type="submit" disabled={!canSpawn}>
							<Send className="mr-2 size-4" aria-hidden />
							{isSpawning ? "Spawning..." : "Spawn"}
						</Button>
					</form>
				</section>
			</div>
		</div>
	);
}

export interface DeckDetailViewProps {
	projectId: string;
	deck: DeckDetail;
	isRefreshing?: boolean;
	isMutating?: boolean;
	onBack: () => void;
	onRefresh: () => void;
	onRequestRevision: (slideId: string, comment: DeckRevisionComment) => void;
	onApproveSlide: (slideId: string) => void;
	onApproveDeck: () => void;
	onExport: (format: DeckExportFormat) => void;
	onChatWithSlide: (reference: ArtifactReference) => void;
}

export function DeckDetailView({
	projectId,
	deck,
	isRefreshing,
	isMutating,
	onBack,
	onRefresh,
	onRequestRevision,
	onApproveSlide,
	onApproveDeck,
	onExport,
	onChatWithSlide,
}: DeckDetailViewProps) {
	const firstSlideId = deck.slides[0]?.slideId;
	const activeSlideFromStore = useDeckSurfaceSelection(deck.deckId, firstSlideId);
	const activeSlideId = activeSlideFromStore.activeSlideId ?? firstSlideId;
	const activeSlide =
		deck.slides.find((slide) => slide.slideId === activeSlideId) ?? deck.slides[0];

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
			<header className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<button
						type="button"
						className="text-xs font-medium text-muted-foreground hover:text-foreground"
						onClick={onBack}
					>
						Back to decks
					</button>
					<div className="mt-2 flex flex-wrap items-center gap-2">
						<h1 className="max-w-4xl truncate text-2xl font-semibold tracking-normal">
							{deck.title}
						</h1>
						<DeckStatusBadge status={deck.status} />
						<Badge variant="outline">{deck.authorRole}</Badge>
						<Badge variant="outline">{deck.reviewerRole}</Badge>
					</div>
					<p className="mt-2 max-w-5xl text-sm text-muted-foreground">
						{deck.scope}
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={onRefresh}
						disabled={isRefreshing}
					>
						<RefreshCw className="mr-2 size-4" aria-hidden />
						Refresh
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => onExport("html")}
						disabled={isMutating}
					>
						<Download className="mr-2 size-4" aria-hidden />
						HTML
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => onExport("pdf")}
						disabled={isMutating}
					>
						<Download className="mr-2 size-4" aria-hidden />
						PDF
					</Button>
					<Button type="button" size="sm" onClick={onApproveDeck} disabled={isMutating}>
						<CheckCircle2 className="mr-2 size-4" aria-hidden />
						Approve deck
					</Button>
				</div>
			</header>

			<div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
				<section className="flex min-h-0 flex-col gap-3">
					<SlideTabs
						slides={deck.slides}
						activeSlideId={activeSlide?.slideId}
						onSelect={(slideId) =>
							activeSlideFromStore.setActiveSlideId(deck.deckId, slideId)
						}
					/>
					{activeSlide ? (
						<SlideReviewPanel
							projectId={projectId}
							deck={deck}
							slide={activeSlide}
							isMutating={isMutating}
							onRequestRevision={onRequestRevision}
							onApproveSlide={onApproveSlide}
							onChatWithSlide={onChatWithSlide}
						/>
					) : (
						<div className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
							No slides found for this deck.
						</div>
					)}
				</section>

				<aside className="flex min-h-0 flex-col gap-4">
					<DeckRightRail deck={deck} />
					<RevisionTimeline events={deck.revisionEvents} />
				</aside>
			</div>
		</div>
	);
}

function SlideTabs({
	slides,
	activeSlideId,
	onSelect,
}: {
	slides: DeckSlideSummary[];
	activeSlideId?: string;
	onSelect: (slideId: string) => void;
}) {
	return (
		<div className="flex gap-2 overflow-x-auto rounded-lg border border-border bg-background/50 p-2">
			{slides.map((slide) => (
				<button
					key={slide.slideId}
					type="button"
					className={`min-w-48 rounded-md px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
						slide.slideId === activeSlideId
							? "bg-accent text-accent-foreground"
							: "hover:bg-accent/50"
					}`}
					onClick={() => onSelect(slide.slideId)}
				>
					<div className="text-xs text-muted-foreground">Slide {slide.index + 1}</div>
					<div className="truncate text-sm font-medium">{slide.title}</div>
				</button>
			))}
		</div>
	);
}

function SlideReviewPanel({
	projectId,
	deck,
	slide,
	isMutating,
	onRequestRevision,
	onApproveSlide,
	onChatWithSlide,
}: {
	projectId: string;
	deck: DeckDetail;
	slide: DeckSlideSummary;
	isMutating?: boolean;
	onRequestRevision: (slideId: string, comment: DeckRevisionComment) => void;
	onApproveSlide: (slideId: string) => void;
	onChatWithSlide: (reference: ArtifactReference) => void;
}) {
	const selection = useDeckSurfaceSelection(deck.deckId, slide.slideId);
	const [comment, setComment] = useState("");
	const selectedTarget =
		selection.selectedTarget ?? slide.commentTargets[0] ?? undefined;
	const reference = useMemo(
		() =>
			deck.references.find((entry) => entry.referenceId.endsWith(slide.slideId)) ?? {
				referenceId: `deck:${deck.deckId}:slide:${slide.slideId}`,
				kind: "slide" as const,
				label: `${deck.title}: ${slide.title}`,
				projectId,
				route: `/factory/projects/${encodeURIComponent(projectId)}/decks/${deck.deckId}`,
				sourceSection: slide.slideId,
				summary: slide.summary,
			},
		[deck, projectId, slide],
	);
	const canSubmit = Boolean(selectedTarget) && comment.trim().length > 0 && !isMutating;

	return (
		<div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
			<SlidePreview
				slide={slide}
				selectedTarget={selectedTarget}
				onSelectTarget={(target) =>
					selection.setSelectedTarget(deck.deckId, slide.slideId, target)
				}
			/>
			<section className="rounded-lg border border-border bg-background/50 p-4">
				<div className="flex items-start justify-between gap-3">
					<div>
						<h2 className="text-sm font-semibold tracking-normal">
							{slide.title}
						</h2>
						<p className="mt-1 text-sm text-muted-foreground">{slide.summary}</p>
					</div>
					<Badge variant="outline">{slide.approvalState}</Badge>
				</div>

				<div className="mt-4 space-y-2">
					<div className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
						Comment target
					</div>
					<div className="grid gap-2">
						{slide.commentTargets.length ? (
							slide.commentTargets.map((target) => (
								<button
									key={target.targetId}
									type="button"
									className={`rounded-md border px-3 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
										selectedTarget?.targetId === target.targetId
											? "border-ring bg-accent"
											: "border-border hover:bg-accent/50"
									}`}
									onClick={() =>
										selection.setSelectedTarget(
											deck.deckId,
											slide.slideId,
											target,
										)
									}
								>
									<div className="font-medium">{target.label}</div>
									<div className="mt-1 text-muted-foreground">
										Line {target.line}, column {target.column}
									</div>
								</button>
							))
						) : (
							<div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
								No source targets found.
							</div>
						)}
					</div>
				</div>

				<label className="mt-4 flex flex-col gap-1 text-xs font-medium text-muted-foreground">
					Revision comment
					<textarea
						value={comment}
						onChange={(event) => setComment(event.target.value)}
						className="min-h-28 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring"
						placeholder="Slide-level note for DECK_AUTHOR"
					/>
				</label>

				<div className="mt-4 flex flex-wrap gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={!canSubmit}
						onClick={() => {
							if (!selectedTarget) return;
							onRequestRevision(slide.slideId, {
								text: comment.trim(),
								line: selectedTarget.line,
								column: selectedTarget.column,
								targetLabel: selectedTarget.label,
								hint: selectedTarget.hint,
							});
							setComment("");
						}}
					>
						<MessageSquarePlus className="mr-2 size-4" aria-hidden />
						Request revision
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => onChatWithSlide(reference)}
					>
						<MessageSquarePlus className="mr-2 size-4" aria-hidden />
						Chat with PC
					</Button>
					<Button
						type="button"
						size="sm"
						disabled={isMutating}
						onClick={() => onApproveSlide(slide.slideId)}
					>
						<CheckCircle2 className="mr-2 size-4" aria-hidden />
						Approve slide
					</Button>
				</div>
			</section>
		</div>
	);
}

function SlidePreview({
	slide,
	selectedTarget,
	onSelectTarget,
}: {
	slide: DeckSlideSummary;
	selectedTarget?: DeckCommentTarget;
	onSelectTarget: (target: DeckCommentTarget) => void;
}) {
	return (
		<section className="min-h-0 rounded-lg border border-border bg-background/50 p-3">
			<div className="relative mx-auto aspect-video max-h-full w-full overflow-hidden rounded-md border border-border bg-muted">
				<iframe
					title={`${slide.title} 1920 by 1080 preview`}
					srcDoc={slide.previewHtml}
					className="h-full w-full"
					sandbox=""
				/>
				<div className="pointer-events-none absolute inset-0">
					{slide.commentTargets.map((target, index) => {
						const top = `${18 + ((target.line + index * 7) % 54)}%`;
						const left = `${12 + ((target.column + index * 11) % 68)}%`;
						return (
							<button
								key={target.targetId}
								type="button"
								className={`pointer-events-auto absolute size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border text-xs font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
									selectedTarget?.targetId === target.targetId
										? "border-ring bg-primary text-primary-foreground"
										: "border-border bg-background text-foreground hover:bg-accent"
								}`}
								style={{ left, top }}
								onClick={() => onSelectTarget(target)}
								aria-label={`Select ${target.label}`}
							>
								{index + 1}
							</button>
						);
					})}
				</div>
			</div>
			<div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
				<span>1920 x 1080</span>
				<span>{slide.commentTargets.length} targets</span>
			</div>
		</section>
	);
}

function DeckRightRail({ deck }: { deck: DeckDetail }) {
	return (
		<section className="rounded-lg border border-border bg-background/50 p-4">
			<h2 className="text-sm font-semibold tracking-normal">Deck rail</h2>
			<div className="mt-3 space-y-3 text-sm">
				<div>
					<div className="text-xs text-muted-foreground">Working folder</div>
					<div className="break-words text-foreground">{deck.ownerPath}</div>
				</div>
				<div>
					<div className="text-xs text-muted-foreground">Dialogue timeline</div>
					<div className="break-words text-foreground">{deck.dialoguePath}</div>
				</div>
				<div className="flex flex-wrap gap-2">
					{deck.exportRecords.map((record) => (
						<Badge key={`${record.format}:${record.requestedAt}`} variant="outline">
							{record.format}: {record.status}
						</Badge>
					))}
				</div>
			</div>
		</section>
	);
}

function RevisionTimeline({ events }: { events: DeckRevisionEvent[] }) {
	return (
		<section className="min-h-0 rounded-lg border border-border bg-background/50 p-4">
			<div className="flex items-center justify-between gap-2">
				<h2 className="text-sm font-semibold tracking-normal">Revision timeline</h2>
				<Badge variant="secondary">{events.length}</Badge>
			</div>
			<div className="mt-3 max-h-[42vh] space-y-3 overflow-auto pr-1">
				{events.length ? (
					events
						.slice()
						.reverse()
						.map((event) => (
							<div
								key={event.eventId}
								className="rounded-md border border-border px-3 py-2"
							>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<Badge variant="outline">{event.type}</Badge>
									<span className="text-xs text-muted-foreground">
										{new Date(event.createdAt).toLocaleString()}
									</span>
								</div>
								<p className="mt-2 text-sm text-muted-foreground">
									{event.summary}
								</p>
								{event.markerId ? (
									<div className="mt-2 text-xs text-muted-foreground">
										{event.markerId}
									</div>
								) : null}
							</div>
						))
				) : (
					<div className="text-sm text-muted-foreground">
						No deck events recorded yet.
					</div>
				)}
			</div>
		</section>
	);
}

function DeckStatusBadge({ status }: { status: string }) {
	return <Badge variant="secondary">{status.replace(/_/g, " ")}</Badge>;
}
