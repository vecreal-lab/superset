import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeckDialoguePersistence } from "main/lib/dialogues/decks";
import { getFactoryReadModel } from "main/lib/factory-read-model";
import type {
	ArtifactReference,
	AuthorAttribution,
	DeckApprovalState,
	DeckDetail,
	DeckExportFormat,
	DeckExportRecord,
	DeckProgressEvent,
	DeckRevisionComment,
	DeckRevisionEvent,
	DeckSlideSummary,
	DeckSummary,
	RightRailItem,
} from "lib/types/factory-operator-console";

export interface SpawnDeckInput {
	projectId: string;
	scope: string;
	audience?: string;
	title?: string;
	requestedBy?: AuthorAttribution;
}

export interface RequestDeckRevisionInput {
	projectId: string;
	deckId: string;
	slideId: string;
	comments: DeckRevisionComment[];
	requestedBy?: AuthorAttribution;
}

export interface ApproveDeckSlideInput {
	projectId: string;
	deckId: string;
	slideId: string;
	approvedBy?: AuthorAttribution;
}

export interface ApproveDeckInput {
	projectId: string;
	deckId: string;
	approvedBy?: AuthorAttribution;
}

export interface ExportDeckInput {
	projectId: string;
	deckId: string;
	format: DeckExportFormat;
	requestedBy?: AuthorAttribution;
}

const DEFAULT_OPERATOR: AuthorAttribution = {
	user: "yuriy",
	displayName: "Yuriy",
	isAgent: false,
};

function nowIso(): string {
	return new Date().toISOString();
}

function slug(value: string, fallback: string): string {
	const safe = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
	return safe || fallback;
}

function projectPathSegments(projectId: string): string[] {
	return projectId
		.split(/[\\/]/)
		.map((segment) => segment.trim())
		.filter(Boolean)
		.map((segment) => slug(segment, "project"));
}

function normalizeRelative(root: string, absolutePath: string): string {
	return path.relative(root, absolutePath).replace(/\\/g, "/");
}

function assertInside(root: string, candidate: string): string {
	const resolvedRoot = path.resolve(root);
	const resolvedCandidate = path.resolve(candidate);
	const relative = path.relative(resolvedRoot, resolvedCandidate);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		throw new Error(`Refusing to access deck path outside ${resolvedRoot}`);
	}
	return resolvedCandidate;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function b64url(value: string): string {
	return Buffer.from(value, "utf8")
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

function makeSlideCommentMarker(comment: DeckRevisionComment, createdAt: string): {
	markerId: string;
	marker: string;
} {
	const markerId = `c-${randomUUID().replace(/-/g, "").slice(0, 24)}`;
	const payload = b64url(
		JSON.stringify({
			note: comment.text,
			hint: comment.hint ?? comment.targetLabel,
		}),
	);
	return {
		markerId,
		marker: `{/* @slide-comment id="${markerId}" ts="${createdAt}" text="${payload}" */}`,
	};
}

function insertCommentMarker(
	source: string,
	comment: DeckRevisionComment,
	marker: string,
): string {
	const lines = source.split(/\r?\n/);
	const lineIndex = Math.min(Math.max(comment.line - 1, 0), lines.length - 1);
	const currentLine = lines[lineIndex] ?? "";
	const indentation = currentLine.match(/^\s*/)?.[0] ?? "";
	const markerLine = `${indentation}\t${marker}`;
	lines.splice(lineIndex + 1, 0, markerLine);
	return lines.join("\n");
}

function commentTargetsFromSource(
	slideId: string,
	source: string,
): DeckSlideSummary["commentTargets"] {
	const lines = source.split(/\r?\n/);
	const targets = lines.flatMap((line, index) => {
		const match = line.match(/<([A-Za-z][A-Za-z0-9]*)\b/);
		if (!match || /Fragment/.test(match[1])) return [];
		const labelMatch =
			line.match(/aria-label="([^"]+)"/) ||
			line.match(/data-comment-label="([^"]+)"/) ||
			line.match(/<([A-Za-z][A-Za-z0-9]*)\b/);
		const tag = match[1];
		return [
			{
				targetId: `${slideId}-${index + 1}-${match.index ?? 0}`,
				label:
					labelMatch?.[1] && labelMatch[1] !== tag
						? labelMatch[1]
						: `${tag} at line ${index + 1}`,
				line: index + 1,
				column: (match.index ?? 0) + 1,
				hint: line.trim().slice(0, 120),
			},
		];
	});
	return targets.slice(0, 12);
}

function slidePreviewHtml(slide: Pick<DeckSlideSummary, "title" | "summary" | "index">): string {
	return `<!doctype html>
<html>
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<style>
			html, body { margin: 0; width: 100%; height: 100%; }
			body {
				font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
				background: Canvas;
				color: CanvasText;
			}
			.slide {
				width: 1920px;
				height: 1080px;
				box-sizing: border-box;
				padding: 104px 128px;
				display: flex;
				flex-direction: column;
				justify-content: space-between;
			}
			.kicker { font-size: 42px; letter-spacing: 0; opacity: 0.72; }
			h1 { max-width: 1280px; margin: 0; font-size: 112px; line-height: 1.04; letter-spacing: 0; }
			p { max-width: 1180px; margin: 0; font-size: 44px; line-height: 1.4; color: GrayText; }
		</style>
	</head>
	<body>
		<main class="slide">
			<div class="kicker">Slide ${slide.index + 1}</div>
			<h1>${escapeHtml(slide.title)}</h1>
			<p>${escapeHtml(slide.summary)}</p>
		</main>
	</body>
</html>`;
}

function deckReference(projectId: string, deck: Pick<DeckDetail, "deckId" | "title" | "ownerPath">): ArtifactReference {
	return {
		referenceId: `deck:${deck.deckId}`,
		kind: "deck",
		label: deck.title,
		projectId,
		path: deck.ownerPath,
		route: `/factory/projects/${encodeURIComponent(projectId)}/decks/${deck.deckId}`,
		summary: "Cockpit pitch deck surface",
	};
}

function slideReference(
	projectId: string,
	deck: Pick<DeckDetail, "deckId" | "title">,
	slide: DeckSlideSummary,
): ArtifactReference {
	return {
		referenceId: `deck:${deck.deckId}:slide:${slide.slideId}`,
		kind: "slide",
		label: `${deck.title}: ${slide.title}`,
		projectId,
		route: `/factory/projects/${encodeURIComponent(projectId)}/decks/${deck.deckId}#${slide.slideId}`,
		sourceSection: slide.slideId,
		summary: slide.summary,
	};
}

function summarize(deck: DeckDetail): DeckSummary {
	return {
		deckId: deck.deckId,
		projectId: deck.projectId,
		title: deck.title,
		scope: deck.scope,
		audience: deck.audience,
		status: deck.status,
		ownerPath: deck.ownerPath,
		dialoguePath: deck.dialoguePath,
		slideCount: deck.slideCount,
		updatedAt: deck.updatedAt,
		approvalState: deck.approvalState,
		exportRecords: deck.exportRecords,
	};
}

export class FactoryDecksRuntime {
	private readonly events = new EventEmitter();
	private readonly persistence: DeckDialoguePersistence;

	constructor(private readonly root = getFactoryReadModel().getRoot()) {
		this.persistence = new DeckDialoguePersistence(root);
	}

	async list(input: { projectId: string }): Promise<DeckSummary[]> {
		const directory = this.pitchDecksDir(input.projectId);
		if (!existsSync(directory)) return [];
		const entries = await readdir(directory, { withFileTypes: true });
		const decks = await Promise.all(
			entries
				.filter((entry) => entry.isDirectory())
				.map((entry) =>
					this.get({ projectId: input.projectId, deckId: entry.name }).catch(
						() => null,
					),
				),
		);
		return decks
			.filter((deck): deck is DeckDetail => Boolean(deck))
			.map(summarize)
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}

	async get(input: { projectId: string; deckId: string }): Promise<DeckDetail> {
		const deckPath = this.deckJsonPath(input.projectId, input.deckId);
		if (!existsSync(deckPath)) {
			throw new Error(`Deck ${input.deckId} was not found for ${input.projectId}.`);
		}
		const stored = JSON.parse(await readFile(deckPath, "utf8")) as DeckDetail;
		const snapshot = await this.persistence.load(input.projectId, input.deckId);
		const slides = await Promise.all(
			stored.slides.map(async (slide) => this.hydrateSlide(input.projectId, input.deckId, slide)),
		);
		const deck: DeckDetail = {
			...stored,
			slides,
			revisionEvents: snapshot.events,
			references: [
				deckReference(input.projectId, stored),
				...slides.map((slide) => slideReference(input.projectId, stored, slide)),
			],
		};
		return deck;
	}

	async spawn(input: SpawnDeckInput): Promise<DeckDetail> {
		const projectId = input.projectId || "software-factory";
		const createdAt = nowIso();
		const deckId = `${new Date()
			.toISOString()
			.slice(0, 10)
			.replace(/-/g, "")}-${slug(input.title || input.scope, "deck")}-${randomUUID()
			.slice(0, 8)}`;
		const directory = this.deckDir(projectId, deckId);
		await mkdir(this.sourceSlidesDir(projectId, deckId), { recursive: true });
		await mkdir(path.join(directory, "exports"), { recursive: true });
		const title = input.title?.trim() || this.titleFromScope(input.scope);
		const slides = this.defaultSlides(title, input.scope, createdAt);
		for (const slide of slides) {
			await this.writeSlideSource(projectId, deckId, slide);
		}
		const approvalState: DeckApprovalState = {
			deck: "draft",
			slides: Object.fromEntries(
				slides.map((slide) => [slide.slideId, slide.approvalState]),
			),
		};
		const deck: DeckDetail = {
			deckId,
			projectId,
			title,
			scope: input.scope,
			audience: input.audience?.trim() || "operator-approved pitch deck audience",
			status: "generation_requested",
			ownerPath: normalizeRelative(this.root, directory),
			dialoguePath: normalizeRelative(
				this.root,
				this.persistence.dialogueDir(projectId, deckId),
			),
			slideCount: slides.length,
			updatedAt: createdAt,
			approvalState,
			exportRecords: [],
			slides,
			revisionEvents: [],
			references: [],
			authorRole: "DECK_AUTHOR",
			reviewerRole: "DECK_REVIEWER",
		};
		const deckWithReferences = {
			...deck,
			references: [
				deckReference(projectId, deck),
				...slides.map((slide) => slideReference(projectId, deck, slide)),
			],
		};
		await this.save(deckWithReferences);
		await this.appendEvent(projectId, {
			eventId: `event-${randomUUID()}`,
			type: "deck_spawn_requested",
			projectId,
			deckId,
			summary:
				"Pitch deck surface created and DECK_AUTHOR/DECK_REVIEWER dispatch recorded for the cockpit.",
			createdAt,
			references: deckWithReferences.references,
		});
		await this.appendEvent(projectId, {
			eventId: `event-${randomUUID()}`,
			type: "author_dispatch_requested",
			projectId,
			deckId,
			summary: "DECK_AUTHOR should produce slide content inside the deck working folder.",
			createdAt,
			references: deckWithReferences.references,
		});
		await this.appendEvent(projectId, {
			eventId: `event-${randomUUID()}`,
			type: "reviewer_dispatch_requested",
			projectId,
			deckId,
			summary: "DECK_REVIEWER should review content and return slide-level findings.",
			createdAt,
			references: deckWithReferences.references,
		});
		return this.get({ projectId, deckId });
	}

	async requestRevision(input: RequestDeckRevisionInput): Promise<DeckDetail> {
		const deck = await this.get(input);
		const slide = deck.slides.find((entry) => entry.slideId === input.slideId);
		if (!slide) {
			throw new Error(`Slide ${input.slideId} was not found in ${input.deckId}.`);
		}
		const createdAt = nowIso();
		const sourcePath = this.slideSourcePath(input.projectId, input.deckId, slide.slideId);
		let source = existsSync(sourcePath) ? await readFile(sourcePath, "utf8") : "";
		const events: DeckRevisionEvent[] = [];
		for (const comment of input.comments) {
			const { markerId, marker } = makeSlideCommentMarker(comment, createdAt);
			if (source) {
				source = insertCommentMarker(source, comment, marker);
			}
			events.push({
				eventId: `event-${randomUUID()}`,
				type: "slide_comment_added",
				projectId: input.projectId,
				deckId: input.deckId,
				slideId: input.slideId,
				summary: `Slide comment mapped to @slide-comment marker ${markerId}.`,
				comment,
				markerId,
				sourcePath: normalizeRelative(this.root, sourcePath),
				createdAt,
				references: [slideReference(input.projectId, deck, slide)],
			});
		}
		if (source) {
			await writeFile(sourcePath, source, "utf8");
		}
		const updatedSlides = deck.slides.map((entry) =>
			entry.slideId === input.slideId
				? {
						...entry,
						approvalState: "needs_revision" as const,
						updatedAt: createdAt,
					}
				: entry,
		);
		const updated: DeckDetail = {
			...deck,
			status: "revision_requested",
			updatedAt: createdAt,
			approvalState: {
				...deck.approvalState,
				deck: "draft",
				slides: {
					...deck.approvalState.slides,
					[input.slideId]: "needs_revision",
				},
			},
			slides: updatedSlides,
		};
		await this.save(updated);
		for (const event of events) {
			await this.appendEvent(input.projectId, event);
		}
		await this.appendEvent(input.projectId, {
			eventId: `event-${randomUUID()}`,
			type: "revision_requested",
			projectId: input.projectId,
			deckId: input.deckId,
			slideId: input.slideId,
			summary:
				"Revision request sent to the deck dialogue timeline with open-slide markers.",
			createdAt,
			references: [slideReference(input.projectId, deck, slide)],
		});
		return this.get(input);
	}

	async approveSlide(input: ApproveDeckSlideInput): Promise<DeckDetail> {
		const deck = await this.get(input);
		const slide = deck.slides.find((entry) => entry.slideId === input.slideId);
		if (!slide) {
			throw new Error(`Slide ${input.slideId} was not found in ${input.deckId}.`);
		}
		const updatedAt = nowIso();
		const updated: DeckDetail = {
			...deck,
			status: "in_review",
			updatedAt,
			approvalState: {
				...deck.approvalState,
				slides: {
					...deck.approvalState.slides,
					[input.slideId]: "approved",
				},
			},
			slides: deck.slides.map((entry) =>
				entry.slideId === input.slideId
					? { ...entry, approvalState: "approved", updatedAt }
					: entry,
			),
		};
		await this.save(updated);
		await this.appendEvent(input.projectId, {
			eventId: `event-${randomUUID()}`,
			type: "slide_approved",
			projectId: input.projectId,
			deckId: input.deckId,
			slideId: input.slideId,
			summary: `${slide.title} was approved by ${
				input.approvedBy?.displayName ?? DEFAULT_OPERATOR.displayName
			}.`,
			createdAt: updatedAt,
			references: [slideReference(input.projectId, deck, slide)],
		});
		return this.get(input);
	}

	async approveDeck(input: ApproveDeckInput): Promise<DeckDetail> {
		const deck = await this.get(input);
		const updatedAt = nowIso();
		const updated: DeckDetail = {
			...deck,
			status: "approved",
			updatedAt,
			approvalState: {
				...deck.approvalState,
				deck: "approved",
				approvedBy: input.approvedBy ?? DEFAULT_OPERATOR,
				approvedAt: updatedAt,
				slides: Object.fromEntries(
					deck.slides.map((slide) => [slide.slideId, "approved"]),
				),
			},
			slides: deck.slides.map((slide) => ({
				...slide,
				approvalState: "approved",
				updatedAt,
			})),
		};
		await this.save(updated);
		await this.appendEvent(input.projectId, {
			eventId: `event-${randomUUID()}`,
			type: "deck_approved",
			projectId: input.projectId,
			deckId: input.deckId,
			summary: `${deck.title} was approved for export.`,
			createdAt: updatedAt,
			references: [deckReference(input.projectId, deck)],
		});
		return this.get(input);
	}

	async export(input: ExportDeckInput): Promise<DeckDetail> {
		const deck = await this.get(input);
		const requestedAt = nowIso();
		const exportsDir = path.join(this.deckDir(input.projectId, input.deckId), "exports");
		await mkdir(exportsDir, { recursive: true });
		const record: DeckExportRecord =
			input.format === "html"
				? await this.writeHtmlExport(deck, exportsDir, requestedAt)
				: await this.recordPdfBrowserPrintExport(deck, exportsDir, requestedAt);
		const updated: DeckDetail = {
			...deck,
			status: record.status === "ready" ? "export_ready" : deck.status,
			updatedAt: record.completedAt ?? requestedAt,
			exportRecords: [
				record,
				...deck.exportRecords.filter((entry) => entry.format !== input.format),
			],
		};
		await this.save(updated);
		await this.appendEvent(input.projectId, {
			eventId: `event-${randomUUID()}`,
			type: "export_requested",
			projectId: input.projectId,
			deckId: input.deckId,
			summary: `${input.format.toUpperCase()} export requested from cockpit.`,
			createdAt: requestedAt,
			references: [deckReference(input.projectId, deck)],
		});
		await this.appendEvent(input.projectId, {
			eventId: `event-${randomUUID()}`,
			type:
				record.status === "browser_print_required"
					? "export_gap_carried_forward"
					: "export_completed",
			projectId: input.projectId,
			deckId: input.deckId,
			summary: record.summary,
			createdAt: record.completedAt ?? requestedAt,
			references: record.path
				? [
						{
							referenceId: `deck:${deck.deckId}:export:${input.format}`,
							kind: "other",
							label: `${deck.title} ${input.format.toUpperCase()} export`,
							projectId: input.projectId,
							path: record.path,
							summary: record.summary,
						},
					]
				: [deckReference(input.projectId, deck)],
		});
		return this.get(input);
	}

	subscribeProgress(
		projectId: string,
		deckId: string,
		listener: (event: DeckProgressEvent) => void,
	): () => void {
		const eventName = this.eventName(projectId, deckId);
		this.events.on(eventName, listener);
		return () => this.events.off(eventName, listener);
	}

	rightRailItemForDeck(deck: DeckDetail): RightRailItem {
		return {
			itemId: `deck-${deck.deckId}`,
			kind: "running_work",
			title: deck.title,
			summary:
				"Pitch deck spawn is approved. DECK_AUTHOR and DECK_REVIEWER are tracked from the deck cockpit.",
			priority: "proactive",
			references: deck.references,
			updatedAt: deck.updatedAt,
			expanded: true,
		};
	}

	private async writeHtmlExport(
		deck: DeckDetail,
		exportsDir: string,
		requestedAt: string,
	): Promise<DeckExportRecord> {
		const filePath = path.join(exportsDir, `${deck.deckId}.html`);
		const html = `<!doctype html>
<html>
	<head>
		<meta charset="utf-8" />
		<title>${escapeHtml(deck.title)}</title>
	</head>
	<body>
		${deck.slides
			.map(
				(slide) => `<section data-slide-id="${escapeHtml(slide.slideId)}">
			<h1>${escapeHtml(slide.title)}</h1>
			<p>${escapeHtml(slide.summary)}</p>
		</section>`,
			)
			.join("\n")}
	</body>
</html>`;
		await writeFile(filePath, html, "utf8");
		const completedAt = nowIso();
		return {
			format: "html",
			status: "ready",
			path: normalizeRelative(this.root, filePath),
			requestedAt,
			completedAt,
			summary: `HTML export written to ${normalizeRelative(this.root, filePath)}.`,
		};
	}

	private async recordPdfBrowserPrintExport(
		deck: DeckDetail,
		exportsDir: string,
		requestedAt: string,
	): Promise<DeckExportRecord> {
		const notePath = path.join(exportsDir, `${deck.deckId}.pdf-export.md`);
		await writeFile(
			notePath,
			[
				`# ${deck.title} PDF Export`,
				"",
				"C34.2-GAP-001 is still carried forward: open-slide has no verified headless PDF export CLI.",
				"Use the browser print flow from the open-slide preview until that gap is closed.",
			].join("\n"),
			"utf8",
		);
		return {
			format: "pdf",
			status: "browser_print_required",
			path: normalizeRelative(this.root, notePath),
			requestedAt,
			summary:
				"PDF export still requires the C34 browser print path; cockpit recorded the export request without inventing a fake PDF.",
		};
	}

	private async hydrateSlide(
		projectId: string,
		deckId: string,
		slide: DeckSlideSummary,
	): Promise<DeckSlideSummary> {
		const sourcePath = this.slideSourcePath(projectId, deckId, slide.slideId);
		if (!existsSync(sourcePath)) {
			return {
				...slide,
				previewHtml: slide.previewHtml ?? slidePreviewHtml(slide),
			};
		}
		const source = await readFile(sourcePath, "utf8");
		return {
			...slide,
			commentTargets: commentTargetsFromSource(slide.slideId, source),
			previewHtml: slide.previewHtml ?? slidePreviewHtml(slide),
		};
	}

	private async save(deck: DeckDetail): Promise<void> {
		const stored: DeckDetail = {
			...deck,
			revisionEvents: [],
		};
		await mkdir(this.deckDir(deck.projectId, deck.deckId), { recursive: true });
		await writeFile(
			this.deckJsonPath(deck.projectId, deck.deckId),
			`${JSON.stringify(stored, null, 2)}\n`,
			"utf8",
		);
		await this.persistence.writeMetadata(deck.projectId, stored);
		this.emitDeckSnapshot(deck.projectId, deck.deckId).catch(() => undefined);
	}

	private async appendEvent(projectId: string, event: DeckRevisionEvent): Promise<void> {
		await this.persistence.appendEvent(projectId, event);
		this.events.emit(this.eventName(projectId, event.deckId), {
			type: "event",
			event,
		} satisfies DeckProgressEvent);
	}

	private async emitDeckSnapshot(projectId: string, deckId: string): Promise<void> {
		const deck = await this.get({ projectId, deckId }).catch(() => null);
		if (!deck) return;
		this.events.emit(this.eventName(projectId, deckId), {
			type: "snapshot",
			deck,
		} satisfies DeckProgressEvent);
	}

	private pitchDecksDir(projectId: string): string {
		return assertInside(
			this.root,
			path.join(this.root, "projects", ...projectPathSegments(projectId), "pitch-decks"),
		);
	}

	private deckDir(projectId: string, deckId: string): string {
		return assertInside(
			this.root,
			path.join(this.pitchDecksDir(projectId), slug(deckId, "deck")),
		);
	}

	private deckJsonPath(projectId: string, deckId: string): string {
		return path.join(this.deckDir(projectId, deckId), "deck.json");
	}

	private sourceSlidesDir(projectId: string, deckId: string): string {
		return path.join(this.deckDir(projectId, deckId), "source", "slides");
	}

	private slideSourcePath(projectId: string, deckId: string, slideId: string): string {
		return path.join(
			this.sourceSlidesDir(projectId, deckId),
			slug(slideId, "slide"),
			"index.tsx",
		);
	}

	private async writeSlideSource(
		projectId: string,
		deckId: string,
		slide: DeckSlideSummary,
	): Promise<void> {
		const slideDir = path.dirname(this.slideSourcePath(projectId, deckId, slide.slideId));
		const title = escapeHtml(slide.title);
		const summary = escapeHtml(slide.summary);
		await mkdir(slideDir, { recursive: true });
		await writeFile(
			path.join(slideDir, "index.tsx"),
			`export default function ${slide.slideId.replace(/[^a-zA-Z0-9]/g, "")}() {
	return (
		<section data-comment-label="${title}">
			<div data-comment-label="Slide title">
				<h1>${title}</h1>
			</div>
			<div data-comment-label="Slide body">
				<p>${summary}</p>
			</div>
		</section>
	);
}
`,
			"utf8",
		);
	}

	private defaultSlides(
		title: string,
		scope: string,
		createdAt: string,
	): DeckSlideSummary[] {
		const base = [
			{
				slideId: "slide-01-opportunity",
				title,
				summary: scope,
			},
			{
				slideId: "slide-02-plan",
				title: "Plan",
				summary: "Author the deck narrative, visual system, and slide acceptance checks.",
			},
			{
				slideId: "slide-03-next-steps",
				title: "Next steps",
				summary: "Review slide comments, approve the deck, and export through cockpit.",
			},
		];
		return base.map((slide, index) => ({
			...slide,
			index,
			approvalState: "draft" as const,
			previewHtml: slidePreviewHtml({ ...slide, index }),
			commentTargets: [],
			updatedAt: createdAt,
		}));
	}

	private titleFromScope(scope: string): string {
		const firstSentence = scope.split(/[.!?]/)[0]?.trim();
		if (firstSentence && firstSentence.length <= 80) return firstSentence;
		return "Pitch Deck";
	}

	private eventName(projectId: string, deckId: string): string {
		return `deck:${projectId}:${deckId}`;
	}
}

let singleton: FactoryDecksRuntime | null = null;

export function getFactoryDecksRuntime(): FactoryDecksRuntime {
	if (!singleton) singleton = new FactoryDecksRuntime();
	return singleton;
}

export function createFactoryDecksRuntimeForTest(root: string): FactoryDecksRuntime {
	return new FactoryDecksRuntime(root);
}
