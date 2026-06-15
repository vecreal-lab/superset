import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
	DeckDetail,
	DeckRevisionEvent,
	RightRailState,
} from "lib/types/factory-operator-console";

type QueueTask<T> = () => Promise<T>;

interface DeckDialogueSnapshot {
	metadata: DeckDetail | null;
	events: DeckRevisionEvent[];
	rightRailState: RightRailState | null;
}

function projectPathSegments(projectId: string): string[] {
	return projectId
		.split(/[\\/]/)
		.map((segment) => segment.trim())
		.filter(Boolean)
		.map((segment) => segment.replace(/[^a-zA-Z0-9._-]/g, "-"));
}

function assertInside(root: string, candidate: string): string {
	const resolvedRoot = path.resolve(root);
	const resolvedCandidate = path.resolve(candidate);
	const relative = path.relative(resolvedRoot, resolvedCandidate);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		throw new Error(`Refusing to access deck dialogue path outside ${resolvedRoot}`);
	}
	return resolvedCandidate;
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
	if (!existsSync(filePath)) return fallback;
	try {
		return JSON.parse(await readFile(filePath, "utf8")) as T;
	} catch {
		return fallback;
	}
}

function parseJsonl<T>(content: string): T[] {
	return content
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.flatMap((line) => {
			try {
				return [JSON.parse(line) as T];
			} catch {
				return [];
			}
		});
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
	await mkdir(path.dirname(filePath), { recursive: true });
	const tempPath = `${filePath}.${Date.now()}.tmp`;
	await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	await rename(tempPath, filePath);
}

export class DeckDialoguePersistence {
	private readonly queues = new Map<string, Promise<unknown>>();

	constructor(private readonly factoryRoot: string) {}

	dialogueDir(projectId: string, deckId: string): string {
		const segments = projectPathSegments(projectId);
		return assertInside(
			this.factoryRoot,
			path.join(this.factoryRoot, "runs", "dialogues", ...segments, "decks", deckId),
		);
	}

	eventsPath(projectId: string, deckId: string): string {
		return path.join(this.dialogueDir(projectId, deckId), "events.jsonl");
	}

	async load(projectId: string, deckId: string): Promise<DeckDialogueSnapshot> {
		const directory = this.dialogueDir(projectId, deckId);
		const [metadata, rightRailState] = await Promise.all([
			readJsonFile<DeckDetail | null>(path.join(directory, "metadata.json"), null),
			readJsonFile<RightRailState | null>(
				path.join(directory, "right-rail-state.json"),
				null,
			),
		]);
		const events = existsSync(this.eventsPath(projectId, deckId))
			? parseJsonl<DeckRevisionEvent>(
					await readFile(this.eventsPath(projectId, deckId), "utf8"),
				)
			: [];
		return { metadata, events, rightRailState };
	}

	async writeMetadata(projectId: string, deck: DeckDetail): Promise<void> {
		await this.enqueue(projectId, deck.deckId, async () => {
			await atomicWriteJson(
				path.join(this.dialogueDir(projectId, deck.deckId), "metadata.json"),
				deck,
			);
		});
	}

	async writeRightRailState(
		projectId: string,
		deckId: string,
		rightRail: RightRailState,
	): Promise<void> {
		await this.enqueue(projectId, deckId, async () => {
			await atomicWriteJson(
				path.join(this.dialogueDir(projectId, deckId), "right-rail-state.json"),
				rightRail,
			);
		});
	}

	async appendEvent(projectId: string, event: DeckRevisionEvent): Promise<void> {
		await this.enqueue(projectId, event.deckId, async () => {
			const eventsPath = this.eventsPath(projectId, event.deckId);
			await mkdir(path.dirname(eventsPath), { recursive: true });
			const previous = existsSync(eventsPath) ? await readFile(eventsPath, "utf8") : "";
			await writeFile(eventsPath, `${previous}${JSON.stringify(event)}\n`, "utf8");
		});
	}

	private async enqueue<T>(
		projectId: string,
		deckId: string,
		task: QueueTask<T>,
	): Promise<T> {
		const key = `${projectId}:${deckId}`;
		const previous = this.queues.get(key) ?? Promise.resolve();
		const next = previous.then(task, task);
		this.queues.set(key, next.catch(() => undefined));
		try {
			return await next;
		} finally {
			if (this.queues.get(key) === next) {
				this.queues.delete(key);
			}
		}
	}
}
