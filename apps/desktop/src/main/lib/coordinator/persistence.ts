import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
	appendFile,
	mkdir,
	readdir,
	readFile,
	rename,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import type {
	ArtifactReference,
	CoordinatorDialogueTurn,
	RightRailState,
} from "lib/types/factory-operator-console";

const COORDINATOR_SURFACE_ID = "coordinator";
const DEFAULT_COORDINATOR_ROLE = "PROJECT_COORDINATOR";

type CoordinatorYamlValue =
	| string
	| number
	| boolean
	| null
	| undefined;

export interface CoordinatorThreadMetadata {
	projectId: string;
	surfaceId: typeof COORDINATOR_SURFACE_ID;
	threadId: string;
	createdAt: string;
	updatedAt: string;
}

export interface CoordinatorStateSnapshot {
	projectId: string;
	surfaceId: typeof COORDINATOR_SURFACE_ID;
	messageCount: number;
	eventCount: number;
	referenceCount: number;
	lastMessageId?: string;
	lastEventCursor?: string;
	lastReplayedAt: string;
	updatedAt: string;
}

export interface CoordinatorPersistenceEvent {
	eventId: string;
	projectId: string;
	type: string;
	cursor: string;
	createdAt: string;
	payload?: Record<string, unknown>;
}

export interface CoordinatorReferenceRecord extends ArtifactReference {
	attachedAt: string;
	turnId?: string;
}

export interface CoordinatorThreadSnapshot {
	projectId: string;
	dir: string;
	metadata: CoordinatorThreadMetadata;
	state: CoordinatorStateSnapshot;
	messages: CoordinatorDialogueTurn[];
	events: CoordinatorPersistenceEvent[];
	references: CoordinatorReferenceRecord[];
	rightRailState: RightRailState;
	replayWarnings: string[];
}

export interface CoordinatorPersistencePaths {
	dir: string;
	metadata: string;
	state: string;
	messages: string;
	events: string;
	rightRailState: string;
	references: string;
	attachments: string;
}

function normalizeSlashes(value: string): string {
	return value.replace(/\\/g, "/");
}

function isInsidePath(parent: string, candidate: string): boolean {
	const relative = path.relative(parent, candidate);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function findFactoryRoot(): string {
	const explicit =
		process.env.SOFTWARE_FACTORY_ROOT || process.env.FACTORY_ROOT || "";
	const startCandidates = [
		explicit,
		process.cwd(),
		path.resolve(process.cwd(), ".."),
		path.resolve(process.cwd(), "..", ".."),
	].filter(Boolean);

	for (const start of startCandidates) {
		let current = path.resolve(start);
		while (true) {
			if (
				existsSync(path.join(current, "work-orders")) &&
				existsSync(path.join(current, "tools", "factory-runner"))
			) {
				return current;
			}
			const next = path.dirname(current);
			if (next === current) break;
			current = next;
		}
	}

	return path.resolve(process.cwd(), "..", "..");
}

function safeProjectSegments(projectId: string): string[] {
	const normalized = normalizeSlashes(projectId.trim() || "software-factory");
	const segments = normalized
		.split("/")
		.map((segment) => segment.trim())
		.filter(Boolean);

	if (segments.length === 0) {
		return ["software-factory"];
	}

	for (const segment of segments) {
		if (
			segment === "." ||
			segment === ".." ||
			segment.includes("..") ||
			/[^A-Za-z0-9._-]/.test(segment)
		) {
			throw new Error(`Coordinator project id must be path-safe: ${projectId}`);
		}
	}

	return segments;
}

function yamlEscape(value: CoordinatorYamlValue): string {
	if (value === undefined || value === null) return "null";
	if (typeof value === "boolean" || typeof value === "number") {
		return String(value);
	}
	return JSON.stringify(value);
}

function stringifyYaml(record: Record<string, CoordinatorYamlValue>): string {
	return `${Object.entries(record)
		.map(([key, value]) => `${key}: ${yamlEscape(value)}`)
		.join("\n")}\n`;
}

function parseYamlScalar(value: string): string | number | boolean | null {
	const trimmed = value.trim();
	if (trimmed === "null") return null;
	if (trimmed === "true") return true;
	if (trimmed === "false") return false;
	if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
	try {
		const parsed = JSON.parse(trimmed) as unknown;
		if (
			typeof parsed === "string" ||
			typeof parsed === "number" ||
			typeof parsed === "boolean" ||
			parsed === null
		) {
			return parsed;
		}
	} catch {
		// Fall through to raw string for compatibility with hand-edited snapshots.
	}
	return trimmed;
}

function parseShallowYaml(raw: string): Record<string, string | number | boolean | null> {
	const result: Record<string, string | number | boolean | null> = {};
	for (const line of raw.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const separator = trimmed.indexOf(":");
		if (separator === -1) continue;
		const key = trimmed.slice(0, separator).trim();
		const value = trimmed.slice(separator + 1);
		if (key) {
			result[key] = parseYamlScalar(value);
		}
	}
	return result;
}

function asString(value: unknown, fallback: string): string {
	return typeof value === "string" && value.trim() ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nowIso(): string {
	return new Date().toISOString();
}

function eventCursor(): string {
	return `${Date.now()}-${randomUUID()}`;
}

function defaultRightRailState(projectId: string): RightRailState {
	return {
		projectId,
		coordinatorRole: DEFAULT_COORDINATOR_ROLE,
		activeItemId: undefined,
		items: [],
		collapsed: false,
		persistsAcrossModes: true,
	};
}

function metadataFromReplay(
	projectId: string,
	messages: CoordinatorDialogueTurn[],
	events: CoordinatorPersistenceEvent[],
	existing?: Partial<CoordinatorThreadMetadata>,
): CoordinatorThreadMetadata {
	const firstMessageAt = messages[0]?.createdAt;
	const firstEventAt = events[0]?.createdAt;
	const lastMessageAt = messages.at(-1)?.createdAt;
	const lastEventAt = events.at(-1)?.createdAt;
	const createdAt =
		existing?.createdAt || firstMessageAt || firstEventAt || nowIso();
	const updatedAt =
		lastEventAt || lastMessageAt || existing?.updatedAt || createdAt;

	return {
		projectId,
		surfaceId: COORDINATOR_SURFACE_ID,
		threadId: existing?.threadId || `${projectId}/coordinator`,
		createdAt,
		updatedAt,
	};
}

function stateFromReplay(
	projectId: string,
	messages: CoordinatorDialogueTurn[],
	events: CoordinatorPersistenceEvent[],
	references: CoordinatorReferenceRecord[],
	existing?: Partial<CoordinatorStateSnapshot>,
): CoordinatorStateSnapshot {
	const replayedAt = nowIso();
	return {
		projectId,
		surfaceId: COORDINATOR_SURFACE_ID,
		messageCount: messages.length,
		eventCount: events.length,
		referenceCount: references.length,
		lastMessageId: messages.at(-1)?.turnId || existing?.lastMessageId,
		lastEventCursor: events.at(-1)?.cursor || existing?.lastEventCursor,
		lastReplayedAt: replayedAt,
		updatedAt:
			events.at(-1)?.createdAt ||
			messages.at(-1)?.createdAt ||
			existing?.updatedAt ||
			replayedAt,
	};
}

async function readOptionalFile(filePath: string): Promise<string | null> {
	try {
		return await readFile(filePath, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return null;
		}
		throw error;
	}
}

async function readJsonl<T>(
	filePath: string,
	label: string,
	warnings: string[],
): Promise<T[]> {
	const raw = await readOptionalFile(filePath);
	if (!raw) return [];

	const rows: T[] = [];
	const lines = raw.split(/\r?\n/);
	lines.forEach((line, index) => {
		const trimmed = line.trim();
		if (!trimmed) return;
		try {
			rows.push(JSON.parse(trimmed) as T);
		} catch (error) {
			warnings.push(
				`Skipped incomplete or invalid ${label} record at line ${index + 1}: ${
					(error as Error).message
				}`,
			);
		}
	});
	return rows;
}

export class CoordinatorPersistence {
	private readonly factoryRoot: string;
	private readonly dialoguesRoot: string;
	private readonly projectQueues = new Map<string, Promise<unknown>>();

	constructor(factoryRoot = findFactoryRoot()) {
		this.factoryRoot = path.resolve(factoryRoot);
		this.dialoguesRoot = path.join(this.factoryRoot, "runs", "dialogues");
	}

	getPaths(projectId: string): CoordinatorPersistencePaths {
		const dir = path.join(
			this.dialoguesRoot,
			...safeProjectSegments(projectId),
			COORDINATOR_SURFACE_ID,
		);
		const resolvedDir = path.resolve(dir);

		if (!isInsidePath(this.dialoguesRoot, resolvedDir)) {
			throw new Error(`Coordinator dialogue path escapes runs/dialogues: ${projectId}`);
		}

		return {
			dir: resolvedDir,
			metadata: path.join(resolvedDir, "metadata.yml"),
			state: path.join(resolvedDir, "state.yml"),
			messages: path.join(resolvedDir, "messages.jsonl"),
			events: path.join(resolvedDir, "events.jsonl"),
			rightRailState: path.join(resolvedDir, "right-rail-state.json"),
			references: path.join(resolvedDir, "references.jsonl"),
			attachments: path.join(resolvedDir, "attachments"),
		};
	}

	async loadProject(projectId: string): Promise<CoordinatorThreadSnapshot> {
		return this.readProject(projectId, true);
	}

	async startupReplay(projectId: string): Promise<CoordinatorThreadSnapshot> {
		return this.enqueue(projectId, async () => {
			const snapshot = await this.readProject(projectId, true);
			await this.writeMetadataUnsafe(projectId, snapshot.metadata);
			await this.writeStateUnsafe(projectId, snapshot.state);
			await this.writeRightRailUnsafe(projectId, snapshot.rightRailState);
			return this.readProject(projectId, true);
		});
	}

	async startupReplayAll(): Promise<CoordinatorThreadSnapshot[]> {
		const projectIds = await this.listProjectsWithCoordinatorThreads();
		const snapshots: CoordinatorThreadSnapshot[] = [];
		for (const projectId of projectIds) {
			snapshots.push(await this.startupReplay(projectId));
		}
		return snapshots;
	}

	async appendMessage(
		projectId: string,
		turn: CoordinatorDialogueTurn,
	): Promise<CoordinatorThreadSnapshot> {
		return this.enqueue(projectId, async () => {
			await this.ensureProjectFiles(projectId);
			await this.appendJsonl(this.getPaths(projectId).messages, turn);
			return this.replayAndSnapshot(projectId);
		});
	}

	async appendEvent(
		projectId: string,
		event: Omit<CoordinatorPersistenceEvent, "eventId" | "projectId" | "cursor" | "createdAt"> &
			Partial<CoordinatorPersistenceEvent>,
	): Promise<CoordinatorThreadSnapshot> {
		return this.enqueue(projectId, async () => {
			await this.ensureProjectFiles(projectId);
			const persistedEvent: CoordinatorPersistenceEvent = {
				eventId: event.eventId || randomUUID(),
				projectId,
				type: event.type,
				cursor: event.cursor || eventCursor(),
				createdAt: event.createdAt || nowIso(),
				payload: event.payload,
			};
			await this.appendJsonl(this.getPaths(projectId).events, persistedEvent);
			return this.replayAndSnapshot(projectId);
		});
	}

	async appendReference(
		projectId: string,
		reference: ArtifactReference,
		turnId?: string,
	): Promise<CoordinatorThreadSnapshot> {
		return this.enqueue(projectId, async () => {
			await this.ensureProjectFiles(projectId);
			const record: CoordinatorReferenceRecord = {
				...reference,
				attachedAt: nowIso(),
				turnId,
			};
			await this.appendJsonl(this.getPaths(projectId).references, record);
			return this.replayAndSnapshot(projectId);
		});
	}

	async writeRightRailState(
		projectId: string,
		rightRailState: RightRailState,
	): Promise<CoordinatorThreadSnapshot> {
		return this.enqueue(projectId, async () => {
			await this.writeRightRailUnsafe(projectId, rightRailState);
			return this.replayAndSnapshot(projectId);
		});
	}

	async writeStateSnapshot(
		projectId: string,
		state: CoordinatorStateSnapshot,
	): Promise<CoordinatorThreadSnapshot> {
		return this.enqueue(projectId, async () => {
			await this.writeStateUnsafe(projectId, state);
			return this.readProject(projectId, true);
		});
	}

	private async replayAndSnapshot(
		projectId: string,
	): Promise<CoordinatorThreadSnapshot> {
		const snapshot = await this.readProject(projectId, true);
		await this.writeMetadataUnsafe(projectId, snapshot.metadata);
		await this.writeStateUnsafe(projectId, snapshot.state);
		return snapshot;
	}

	private async readProject(
		projectId: string,
		ensureFiles: boolean,
	): Promise<CoordinatorThreadSnapshot> {
		if (ensureFiles) {
			await this.ensureProjectFiles(projectId);
		}

		const paths = this.getPaths(projectId);
		const warnings: string[] = [];
		const [metadataRaw, stateRaw, rightRailRaw, messages, events, references] =
			await Promise.all([
				readOptionalFile(paths.metadata),
				readOptionalFile(paths.state),
				readOptionalFile(paths.rightRailState),
				readJsonl<CoordinatorDialogueTurn>(paths.messages, "message", warnings),
				readJsonl<CoordinatorPersistenceEvent>(paths.events, "event", warnings),
				readJsonl<CoordinatorReferenceRecord>(
					paths.references,
					"reference",
					warnings,
				),
			]);

		const existingMetadata = metadataRaw
			? parseShallowYaml(metadataRaw)
			: undefined;
		const existingState = stateRaw ? parseShallowYaml(stateRaw) : undefined;
		const metadata = metadataFromReplay(projectId, messages, events, {
			projectId: asString(existingMetadata?.project_id, projectId),
			surfaceId: COORDINATOR_SURFACE_ID,
			threadId: asString(existingMetadata?.thread_id, `${projectId}/coordinator`),
			createdAt: asString(existingMetadata?.created_at, ""),
			updatedAt: asString(existingMetadata?.updated_at, ""),
		});
		const state = stateFromReplay(projectId, messages, events, references, {
			projectId: asString(existingState?.project_id, projectId),
			surfaceId: COORDINATOR_SURFACE_ID,
			messageCount: asNumber(existingState?.message_count, 0),
			eventCount: asNumber(existingState?.event_count, 0),
			referenceCount: asNumber(existingState?.reference_count, 0),
			lastMessageId: asString(existingState?.last_message_id, ""),
			lastEventCursor: asString(existingState?.last_event_cursor, ""),
			lastReplayedAt: asString(existingState?.last_replayed_at, ""),
			updatedAt: asString(existingState?.updated_at, ""),
		});
		let rightRailState = defaultRightRailState(projectId);

		if (rightRailRaw?.trim()) {
			try {
				rightRailState = JSON.parse(rightRailRaw) as RightRailState;
			} catch (error) {
				warnings.push(
					`Ignored invalid right-rail-state.json: ${(error as Error).message}`,
				);
			}
		}

		return {
			projectId,
			dir: paths.dir,
			metadata,
			state,
			messages,
			events,
			references,
			rightRailState,
			replayWarnings: warnings,
		};
	}

	private async ensureProjectFiles(projectId: string): Promise<void> {
		const paths = this.getPaths(projectId);
		await mkdir(paths.dir, { recursive: true });
		await mkdir(paths.attachments, { recursive: true });

		const createdAt = nowIso();
		await Promise.all([
			this.ensureFile(paths.messages, ""),
			this.ensureFile(paths.events, ""),
			this.ensureFile(paths.references, ""),
			this.ensureFile(
				paths.metadata,
				stringifyYaml({
					project_id: projectId,
					surface_id: COORDINATOR_SURFACE_ID,
					thread_id: `${projectId}/coordinator`,
					created_at: createdAt,
					updated_at: createdAt,
				}),
			),
			this.ensureFile(
				paths.state,
				stringifyYaml({
					project_id: projectId,
					surface_id: COORDINATOR_SURFACE_ID,
					message_count: 0,
					event_count: 0,
					reference_count: 0,
					last_replayed_at: createdAt,
					updated_at: createdAt,
				}),
			),
			this.ensureFile(
				paths.rightRailState,
				`${JSON.stringify(defaultRightRailState(projectId), null, 2)}\n`,
			),
		]);
	}

	private async ensureFile(filePath: string, contents: string): Promise<void> {
		if (existsSync(filePath)) return;
		await writeFile(filePath, contents, "utf8");
	}

	private async writeMetadataUnsafe(
		projectId: string,
		metadata: CoordinatorThreadMetadata,
	): Promise<void> {
		await this.atomicWrite(
			this.getPaths(projectId).metadata,
			stringifyYaml({
				project_id: metadata.projectId,
				surface_id: metadata.surfaceId,
				thread_id: metadata.threadId,
				created_at: metadata.createdAt,
				updated_at: metadata.updatedAt,
			}),
		);
	}

	private async writeStateUnsafe(
		projectId: string,
		state: CoordinatorStateSnapshot,
	): Promise<void> {
		await this.atomicWrite(
			this.getPaths(projectId).state,
			stringifyYaml({
				project_id: state.projectId,
				surface_id: state.surfaceId,
				message_count: state.messageCount,
				event_count: state.eventCount,
				reference_count: state.referenceCount,
				last_message_id: state.lastMessageId,
				last_event_cursor: state.lastEventCursor,
				last_replayed_at: state.lastReplayedAt,
				updated_at: state.updatedAt,
			}),
		);
	}

	private async writeRightRailUnsafe(
		projectId: string,
		rightRailState: RightRailState,
	): Promise<void> {
		await this.atomicWrite(
			this.getPaths(projectId).rightRailState,
			`${JSON.stringify(rightRailState, null, 2)}\n`,
		);
	}

	private async atomicWrite(filePath: string, contents: string): Promise<void> {
		const dir = path.dirname(filePath);
		await mkdir(dir, { recursive: true });
		const tempPath = path.join(
			dir,
			`.${path.basename(filePath)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`,
		);
		await writeFile(tempPath, contents, "utf8");
		await rename(tempPath, filePath);
	}

	private async appendJsonl<T>(filePath: string, record: T): Promise<void> {
		await mkdir(path.dirname(filePath), { recursive: true });
		await appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
	}

	private enqueue<T>(projectId: string, operation: () => Promise<T>): Promise<T> {
		const key = normalizeSlashes(projectId || "software-factory");
		const previous = this.projectQueues.get(key) ?? Promise.resolve();
		const next = previous.catch(() => undefined).then(operation);
		this.projectQueues.set(
			key,
			next.catch(() => undefined),
		);
		return next;
	}

	private async listProjectsWithCoordinatorThreads(): Promise<string[]> {
		const projects = new Set<string>();

		async function walk(currentDir: string, relativeSegments: string[]) {
			let entries;
			try {
				entries = await readdir(currentDir, { withFileTypes: true });
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") {
					return;
				}
				throw error;
			}

			for (const entry of entries) {
				if (!entry.isDirectory()) continue;
				if (entry.name === COORDINATOR_SURFACE_ID) {
					projects.add(relativeSegments.join("/"));
					continue;
				}
				await walk(path.join(currentDir, entry.name), [
					...relativeSegments,
					entry.name,
				]);
			}
		}

		await walk(this.dialoguesRoot, []);
		return [...projects].filter(Boolean).sort();
	}
}

export const coordinatorPersistence = new CoordinatorPersistence();
