import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import {
	getFactoryReadModel,
	type FactoryRow,
} from "main/lib/factory-read-model";
import type {
	ArtifactReference,
	AuthorAttribution,
	CoordinatorMode,
	CoordinatorSurfaceContext,
	RightRailItem,
	RightRailState,
} from "lib/types/factory-operator-console";
import type {
	CoordinatorDialogueTurn,
	CoordinatorProvider,
	CoordinatorStreamEmitter,
	CoordinatorStreamEvent,
} from "./events";
import {
	getCoordinatorBlockerHub,
	isCoordinatorBlockerRightRailItem,
	mergeCoordinatorBlockerItems,
	type CoordinatorBlockerReconcileReason,
} from "./blockers";
import {
	filterToolResultForChat,
	plainEnglishError,
	sanitizeForOperator,
} from "./plain-english";
import { coordinatorPersistence } from "./persistence";
import { buildProjectCoordinatorPrompt } from "./prompt-loader";
import { CliCoordinatorProvider, MockCoordinatorProvider } from "./providers/cli";
import {
	COORDINATOR_TOOL_KINDS,
	createCoordinatorToolCall,
	createRightRailItemForToolCall,
	defaultRiskForTool,
	inferToolKindFromMessage,
	isHighStakesTool,
	type CoordinatorToolCall,
	type CoordinatorToolKind,
	type CoordinatorToolResult,
} from "./tools";

export interface CoordinatorSendTurnInput {
	projectId: string;
	message: string;
	author?: AuthorAttribution;
	references?: ArtifactReference[];
	activeMode?: CoordinatorMode;
	mockResponse?: string;
	mockToolKind?: CoordinatorToolKind;
	signal?: AbortSignal;
	emit?: CoordinatorStreamEmitter;
}

export interface CoordinatorRecentActivityItem {
	id: string;
	title: string;
	status: string | null;
	sourceRelativePath: string;
	modifiedAt: string | null;
	kind: "run" | "work_order" | "approval";
}

interface CoordinatorProjectState {
	context: CoordinatorSurfaceContext;
	history: CoordinatorDialogueTurn[];
	pendingTools: Map<string, CoordinatorToolCall>;
}

interface CoordinatorRuntimeOptions {
	enableBlockerSubscriptions?: boolean;
}

type RightRailListener = (state: RightRailState) => void;
type BlockerListener = (items: RightRailItem[]) => void;

const COORDINATOR_AUTHOR: AuthorAttribution = {
	user: "PROJECT_COORDINATOR",
	role: "PROJECT_COORDINATOR",
	isAgent: true,
	displayName: "PROJECT_COORDINATOR",
};

const DEFAULT_OPERATOR_AUTHOR: AuthorAttribution = {
	user: "yuriy",
	isAgent: false,
	displayName: "Yuriy",
};

function nowIso(): string {
	return new Date().toISOString();
}

function historyPathForProject(projectId: string): string {
	return `runs/dialogues/${projectId}/coordinator/`;
}

function messagePathForProject(projectId: string): string {
	return `${historyPathForProject(projectId)}messages.jsonl`;
}

function createEmptyRightRail(projectId: string): RightRailState {
	return {
		projectId,
		coordinatorRole: "PROJECT_COORDINATOR",
		items: [],
		collapsed: false,
		persistsAcrossModes: true,
	};
}

function createInitialContext(projectId: string): CoordinatorSurfaceContext {
	const rightRail = createEmptyRightRail(projectId);
	return {
		projectId,
		coordinatorRole: "PROJECT_COORDINATOR",
		activeMode: "general",
		activeDialogueId: `coordinator-${projectId}`,
		historyPath: historyPathForProject(projectId),
		rightRail,
		currentReferences: [],
	};
}

function rowMatchesProject(row: FactoryRow, projectId: string): boolean {
	const dataProject =
		typeof row.data.project_id === "string"
			? row.data.project_id
			: typeof row.data.project === "string"
				? row.data.project
				: undefined;
	return (
		dataProject === projectId ||
		row.source_relative_path.includes(`/projects/${projectId}/`) ||
		row.source_relative_path.includes(`projects/${projectId}/`) ||
		row.id.includes(projectId)
	);
}

function rowToActivity(
	row: FactoryRow,
	kind: CoordinatorRecentActivityItem["kind"],
): CoordinatorRecentActivityItem {
	return {
		id: row.id,
		title: row.title,
		status: row.status,
		sourceRelativePath: row.source_relative_path,
		modifiedAt: row.modified_at,
		kind,
	};
}

function upsertRightRailItem(
	rightRail: RightRailState,
	item: RightRailItem,
): RightRailState {
	const existingIndex = rightRail.items.findIndex((entry) => entry.itemId === item.itemId);
	const items =
		existingIndex >= 0
			? rightRail.items.map((entry, index) => (index === existingIndex ? item : entry))
			: [item, ...rightRail.items];
	return {
		...rightRail,
		activeItemId: item.itemId,
		items,
		collapsed: false,
	};
}

function mergeTurns(
	persisted: CoordinatorDialogueTurn[],
	memory: CoordinatorDialogueTurn[],
): CoordinatorDialogueTurn[] {
	const turnsById = new Map<string, CoordinatorDialogueTurn>();
	for (const turn of persisted) turnsById.set(turn.turnId, turn);
	for (const turn of memory) turnsById.set(turn.turnId, turn);
	return [...turnsById.values()].sort((a, b) =>
		a.createdAt.localeCompare(b.createdAt),
	);
}

function mergeRightRailItemsById(
	persisted: RightRailItem[],
	memory: RightRailItem[],
): RightRailItem[] {
	const itemsById = new Map<string, RightRailItem>();
	for (const item of persisted) itemsById.set(item.itemId, item);
	for (const item of memory) itemsById.set(item.itemId, item);
	return [...itemsById.values()].sort((a, b) => {
		const priorityRank: Record<RightRailItem["priority"], number> = {
			interrupting: 0,
			proactive: 1,
			ambient: 2,
		};
		const priority = priorityRank[a.priority] - priorityRank[b.priority];
		if (priority !== 0) return priority;
		return b.updatedAt.localeCompare(a.updatedAt);
	});
}

export class CoordinatorRuntime {
	private readonly states = new Map<string, CoordinatorProjectState>();
	private readonly events = new EventEmitter();
	private readonly blockerUnsubscribers = new Map<string, () => void>();

	constructor(
		private readonly provider: CoordinatorProvider = new CliCoordinatorProvider(),
		private readonly options: CoordinatorRuntimeOptions = {},
	) {}

	get availableToolKinds(): readonly CoordinatorToolKind[] {
		return COORDINATOR_TOOL_KINDS;
	}

	private stateForProject(projectId: string): CoordinatorProjectState {
		const existing = this.states.get(projectId);
		if (existing) return existing;
		const state: CoordinatorProjectState = {
			context: createInitialContext(projectId),
			history: [],
			pendingTools: new Map(),
		};
		this.states.set(projectId, state);
		if (this.options.enableBlockerSubscriptions !== false) {
			this.ensureBlockerSubscription(projectId);
		}
		return state;
	}

	private async hydrateProjectFromPersistence(
		projectId: string,
	): Promise<CoordinatorProjectState> {
		const state = this.stateForProject(projectId);
		try {
			const snapshot = await coordinatorPersistence.loadProject(projectId);
			const references = snapshot.references.map((reference) => ({
				referenceId: reference.referenceId,
				kind: reference.kind,
				label: reference.label,
				projectId: reference.projectId,
				path: reference.path,
				route: reference.route,
				sourceSection: reference.sourceSection,
				summary: reference.summary,
			}));
			state.history = mergeTurns(snapshot.messages, state.history);
			state.context = {
				...state.context,
				historyPath: historyPathForProject(projectId),
				rightRail: {
					...snapshot.rightRailState,
					projectId,
					coordinatorRole: "PROJECT_COORDINATOR",
					items: mergeRightRailItemsById(
						snapshot.rightRailState.items,
						state.context.rightRail.items,
					),
					collapsed: state.context.rightRail.collapsed,
				},
				currentReferences: references,
			};
		} catch (error) {
			console.warn("[coordinator-runtime] persistence hydration failed", {
				projectId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
		return state;
	}

	private ensureBlockerSubscription(projectId: string): void {
		if (this.blockerUnsubscribers.has(projectId)) return;
		const unsubscribe = getCoordinatorBlockerHub().subscribe(
			projectId,
			(items) => {
				const state = this.stateForProject(projectId);
				state.context = {
					...state.context,
					rightRail: {
						...state.context.rightRail,
						items: mergeCoordinatorBlockerItems(
							state.context.rightRail.items,
							items,
						),
					},
				};
				this.emitRightRail(projectId);
			},
		);
		this.blockerUnsubscribers.set(projectId, unsubscribe);
	}

	private async reconcileBlockerItems(
		projectId: string,
		reason: CoordinatorBlockerReconcileReason,
	): Promise<RightRailItem[]> {
		const snapshot = await getCoordinatorBlockerHub().reconcileProject(
			projectId,
			reason,
			false,
		);
		const state = this.stateForProject(projectId);
		const items = mergeCoordinatorBlockerItems(
			state.context.rightRail.items,
			snapshot.items,
		);
		const activeItemStillExists =
			!state.context.rightRail.activeItemId ||
			items.some((item) => item.itemId === state.context.rightRail.activeItemId);
		const nextActiveItemId = activeItemStillExists
			? state.context.rightRail.activeItemId
			: items.find(isCoordinatorBlockerRightRailItem)?.itemId;
		state.context = {
			...state.context,
			rightRail: {
				...state.context.rightRail,
				activeItemId: nextActiveItemId,
				items,
			},
		};
		return snapshot.items;
	}

	async context(projectId: string): Promise<CoordinatorSurfaceContext> {
		await this.hydrateProjectFromPersistence(projectId);
		if (this.options.enableBlockerSubscriptions !== false) {
			await this.reconcileBlockerItems(projectId, "context_load");
		}
		return this.stateForProject(projectId).context;
	}

	async history(projectId: string): Promise<CoordinatorDialogueTurn[]> {
		return (await this.hydrateProjectFromPersistence(projectId)).history;
	}

	async rightRail(projectId: string): Promise<RightRailState> {
		await this.hydrateProjectFromPersistence(projectId);
		if (this.options.enableBlockerSubscriptions !== false) {
			await this.reconcileBlockerItems(projectId, "context_load");
		}
		return this.stateForProject(projectId).context.rightRail;
	}

	async blockerItems(projectId: string): Promise<RightRailItem[]> {
		if (this.options.enableBlockerSubscriptions === false) return [];
		return this.reconcileBlockerItems(projectId, "subscription_start");
	}

	async recentActivity(projectId: string): Promise<CoordinatorRecentActivityItem[]> {
		const readModel = getFactoryReadModel();
		const [runs, workOrders, approvals] = await Promise.all([
			readModel.getDataset("runs"),
			readModel.getDataset("work_orders"),
			readModel.getDataset("approvals"),
		]);
		return [
			...runs.filter((row) => rowMatchesProject(row, projectId)).map((row) => rowToActivity(row, "run")),
			...workOrders
				.filter((row) => rowMatchesProject(row, projectId))
				.map((row) => rowToActivity(row, "work_order")),
			...approvals
				.filter((row) => rowMatchesProject(row, projectId))
				.map((row) => rowToActivity(row, "approval")),
		]
			.sort((a, b) => (b.modifiedAt || "").localeCompare(a.modifiedAt || ""))
			.slice(0, 20);
	}

	subscribeRightRail(projectId: string, listener: RightRailListener): () => void {
		if (this.options.enableBlockerSubscriptions !== false) {
			this.ensureBlockerSubscription(projectId);
		}
		const eventName = `rightRail:${projectId}`;
		this.events.on(eventName, listener);
		return () => this.events.off(eventName, listener);
	}

	subscribeBlockers(projectId: string, listener: BlockerListener): () => void {
		if (this.options.enableBlockerSubscriptions !== false) {
			this.ensureBlockerSubscription(projectId);
		}
		const eventName = `blockers:${projectId}`;
		this.events.on(eventName, listener);
		return () => this.events.off(eventName, listener);
	}

	async updateRightRailItem(input: {
		projectId: string;
		itemId: string;
		patch: Partial<RightRailItem>;
	}): Promise<RightRailState> {
		const state = this.stateForProject(input.projectId);
		state.context = {
			...state.context,
			rightRail: {
				...state.context.rightRail,
				items: state.context.rightRail.items.map((item) =>
					item.itemId === input.itemId
						? { ...item, ...input.patch, updatedAt: nowIso() }
						: item,
				),
			},
		};
		await coordinatorPersistence.writeRightRailState(
			input.projectId,
			state.context.rightRail,
		);
		this.emitRightRail(input.projectId);
		return state.context.rightRail;
	}

	async approveToolCall(input: {
		projectId: string;
		toolCallId: string;
		approved: boolean;
		decidedBy?: AuthorAttribution;
		guidance?: string;
	}): Promise<CoordinatorToolResult> {
		const state = this.stateForProject(input.projectId);
		const toolCall = state.pendingTools.get(input.toolCallId);
		if (!toolCall) {
			return filterToolResultForChat({
				toolCallId: input.toolCallId,
				status: "failed",
				plainEnglishSummary:
					"I could not find that pending tool request. It may have already been handled.",
				createdReferences: [],
				rightRailUpdates: [],
			});
		}

		const nextApproval = input.approved ? "operator_approved" : "operator_rejected";
		const updated: CoordinatorToolCall = {
			...toolCall,
			approval: nextApproval,
		};
		state.pendingTools.set(updated.toolCallId, updated);

		const updatedRailItems = state.context.rightRail.items.map((item) =>
			item.gate?.gateId === `gate-${updated.toolCallId}` ||
			item.itemId === `rail-${updated.toolCallId}`
				? {
						...item,
						kind: input.approved ? "recently_completed" : item.kind,
						priority: input.approved ? "ambient" : item.priority,
						summary: input.approved
							? `${updated.kind} was approved by the operator.`
							: `${updated.kind} was not approved.`,
						updatedAt: nowIso(),
					}
				: item,
		);
		state.context = {
			...state.context,
			rightRail: {
				...state.context.rightRail,
				items: updatedRailItems,
			},
		};
		await coordinatorPersistence.writeRightRailState(
			input.projectId,
			state.context.rightRail,
		);
		await coordinatorPersistence.appendEvent(input.projectId, {
			type: "tool_call_decision",
			payload: {
				toolCallId: updated.toolCallId,
				approved: input.approved,
				decidedBy: input.decidedBy,
				guidance: input.guidance,
			},
		});
		this.emitRightRail(input.projectId);

		const result: CoordinatorToolResult = {
			toolCallId: updated.toolCallId,
			status: input.approved ? "completed" : "canceled",
			plainEnglishSummary: input.approved
				? `${updated.kind} is approved. Execution is reserved for the implementation stream that owns the actual operation.`
				: `${updated.kind} was not approved. I will not run it.`,
			createdReferences: [],
			rightRailUpdates: [],
		};

		const filtered = filterToolResultForChat(result);
		await coordinatorPersistence.appendEvent(input.projectId, {
			type: "tool_result",
			payload: filtered as unknown as Record<string, unknown>,
		});
		return filtered;
	}

	async sendTurn(input: CoordinatorSendTurnInput): Promise<CoordinatorStreamEvent[]> {
		const emitted: CoordinatorStreamEvent[] = [];
		const emit = (event: CoordinatorStreamEvent) => {
			emitted.push(event);
			input.emit?.(event);
			void coordinatorPersistence.appendEvent(input.projectId, {
				type: event.type,
				payload: event as unknown as Record<string, unknown>,
			});
		};

		const state = await this.hydrateProjectFromPersistence(input.projectId);
		const turnId = `turn-${randomUUID()}`;
		const createdAt = nowIso();
		const operatorAuthor = input.author ?? DEFAULT_OPERATOR_AUTHOR;
		const references = input.references ?? [];
		state.context = {
			...state.context,
			activeMode: input.activeMode ?? state.context.activeMode,
			currentReferences: references,
		};

		emit({
			type: "turn_started",
			turnId,
			context: state.context,
		});

		const operatorTurn: CoordinatorDialogueTurn = {
			turnId,
			role: "operator",
			author: operatorAuthor,
			text: input.message,
			references,
			createdAt,
		};
		state.history.push(operatorTurn);
		await coordinatorPersistence.appendMessage(input.projectId, operatorTurn);
		for (const reference of references) {
			await coordinatorPersistence.appendReference(input.projectId, reference, turnId);
		}

		const toolKind = input.mockToolKind ?? inferToolKindFromMessage(input.message);
		const toolCall = toolKind
			? createCoordinatorToolCall({
					kind: toolKind,
					projectId: input.projectId,
					requestedBy: operatorAuthor,
					rationale: `Yuriy asked the Project Coordinator to ${toolKind.replace(/_/g, " ")}.`,
					references,
					risk: defaultRiskForTool(toolKind),
					payload: { message: input.message },
					createdAt,
				})
			: undefined;

		if (toolCall && isHighStakesTool(toolCall.kind, toolCall.risk)) {
			state.pendingTools.set(toolCall.toolCallId, toolCall);
			const rightRailItem = createRightRailItemForToolCall(toolCall);
			state.context = {
				...state.context,
				rightRail: upsertRightRailItem(state.context.rightRail, rightRailItem),
			};
			await coordinatorPersistence.writeRightRailState(
				input.projectId,
				state.context.rightRail,
			);
			emit({ type: "tool_call_proposed", turnId, toolCall });
			emit({
				type: "right_rail_updated",
				projectId: input.projectId,
				rightRail: state.context.rightRail,
			});
			this.emitRightRail(input.projectId);
		}

		try {
			const recentActivity =
				input.mockResponse || this.provider.id === "mock"
					? []
					: await this.recentActivity(input.projectId);
			const promptBundle = await buildProjectCoordinatorPrompt({
				projectId: input.projectId,
				operatorMessage: input.message,
				history: state.history,
				rightRail: state.context.rightRail,
				context: state.context,
				currentReferences: references,
				recentActivity: recentActivity.map((item) => ({ ...item })),
			});
			const provider = input.mockResponse
				? new MockCoordinatorProvider(input.mockResponse)
				: this.provider;
			let streamedText = "";
			const providerResult = await provider.invoke({
				projectId: input.projectId,
				dialogueId: state.context.activeDialogueId,
				turnId,
				message: input.message,
				prompt: promptBundle.prompt,
				signal: input.signal,
				onChunk: (chunk) => {
					streamedText += chunk;
					emit({ type: "chunk", turnId, text: chunk });
				},
			});

			const finalText = sanitizeForOperator(providerResult.text || streamedText);
			const agentTurn: CoordinatorDialogueTurn = {
				turnId: `turn-${randomUUID()}`,
				role: "agent",
				author: COORDINATOR_AUTHOR,
				agentRole: "PROJECT_COORDINATOR",
				text: finalText,
				references,
				toolCalls: toolCall ? [toolCall] : undefined,
				createdAt: nowIso(),
			};
			state.history.push(agentTurn);
			await coordinatorPersistence.appendMessage(input.projectId, agentTurn);
			emit({
				type: "message_persisted",
				turnId,
				messagePath: messagePathForProject(input.projectId),
				message: agentTurn,
			});
			emit({
				type: "complete",
				turnId,
				context: state.context,
			});
		} catch (error) {
			const summary = plainEnglishError(error);
			emit({
				type: "error",
				turnId,
				plainEnglishSummary: summary,
			});
		}

		return emitted;
	}

	private emitRightRail(projectId: string): void {
		const state = this.stateForProject(projectId);
		this.events.emit(`rightRail:${projectId}`, state.context.rightRail);
		const blockers = state.context.rightRail.items.filter(isCoordinatorBlockerRightRailItem);
		this.events.emit(`blockers:${projectId}`, blockers);
	}
}

let singleton: CoordinatorRuntime | null = null;

export function getCoordinatorRuntime(): CoordinatorRuntime {
	if (!singleton) singleton = new CoordinatorRuntime();
	return singleton;
}

export function createCoordinatorRuntimeForTest(
	provider: CoordinatorProvider,
): CoordinatorRuntime {
	return new CoordinatorRuntime(provider, { enableBlockerSubscriptions: false });
}
