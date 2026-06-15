export interface AuthorAttribution {
	user: string;
	role?: string;
	isAgent: boolean;
	displayName: string;
}

export interface WorkspaceContext {
	workspaceId: string;
	projectsRoot: string;
	primaryOwner: string;
	repoUrl?: string;
	isMultiUser: boolean;
}

declare global {
	interface FactoryWorkspaceContext {
		workspaceId: string;
		projectId: string;
		currentOperatorId: string;
		currentOperatorDisplayName: string;
	}
}

export type WorkOrderStatus =
	| "queued"
	| "in_flight"
	| "completed"
	| "superseded"
	| "abandoned";

export type WorkOrderRunState =
	| "queued"
	| "ready"
	| "blocked"
	| "running"
	| "awaiting_approval"
	| "completed"
	| "failed"
	| "canceled";

export interface WorkOrderListItem {
	id: string;
	title: string;
	status: WorkOrderStatus;
	rigorTier: 1 | 2 | 3;
	riskClassification: "low" | "medium" | "high";
	author: AuthorAttribution;
	assignedTo: AuthorAttribution;
	projectId: string;
	scope:
		| "infrastructure"
		| "product"
		| "brand"
		| "docs"
		| "cleanup"
		| "dashboard"
		| "other";
	state: WorkOrderRunState;
	blockedBy?: string[];
	lastActivityAt: string;
	hasOpenGate: boolean;
	inFlightRunId?: string;
}

export interface VerificationCommand {
	command: string;
	cwd: string;
	required: boolean;
	rationale?: string;
}

export interface ProposedDecision {
	id: string;
	summary: string;
}

export interface WorkOrderDetail extends WorkOrderListItem {
	context: string;
	intent: string;
	cites: string[];
	allowedPaths: string[];
	forbiddenPaths: string[];
	acceptanceCriteria: string[];
	verificationPlan: VerificationCommand[];
	decisionContract: ProposedDecision[];
	rollbackStrategy: string;
	pipelineProfile: string;
	pipelineVariant: string;
	modifiesFactoryMachinery: boolean;
	foundationClassAmendment: boolean;
	runHistory: RunSummary[];
	currentRun?: RunState;
	pipelineStages: PipelineStage[];
}

export interface RunSummary {
	runId: string;
	workOrderId: string;
	status: RunStatus;
	startedAt: string;
	completedAt?: string;
	receiptPath?: string;
}

export type RunStatus =
	| "pending"
	| "running"
	| "completed"
	| "failed"
	| "canceled"
	| "paused_for_gate";

export interface RunState {
	runId: string;
	workOrderId: string;
	status: RunStatus;
	startedAt: string;
	completedAt?: string;
	canceledAt?: string;
	currentStageId?: string;
	stages: StageRecord[];
	triggeredBy: AuthorAttribution;
	executedBy: AuthorAttribution;
	manualInterventions: ManualIntervention[];
}

export interface StageRecord {
	stageId: string;
	stageName: string;
	status: "pending" | "running" | "completed" | "failed" | "canceled";
	startedAt?: string;
	completedAt?: string;
	receiptPath?: string;
	outputs?: string[];
}

export interface ManualIntervention {
	at: string;
	reason: string;
	proposedFix?: string;
}

export type RunStateEvent =
	| { kind: "stage_started"; runId: string; stage: StageRecord }
	| { kind: "stage_completed"; runId: string; stage: StageRecord; outputs: string[] }
	| { kind: "stage_failed"; runId: string; stage: StageRecord; failureReason: string }
	| { kind: "gate_required"; runId: string; gate: GateRequest }
	| { kind: "mockups_generated"; runId: string; bundle: MockupBundle }
	| {
			kind: "manual_intervention_logged";
			runId: string;
			intervention: ManualIntervention;
	  }
	| { kind: "run_completed"; runId: string; finalReceipt: SynthesisPacket }
	| { kind: "run_failed"; runId: string; reason: string }
	| { kind: "run_canceled"; runId: string; canceledBy: AuthorAttribution };

export type GateType =
	| "mockup_approval"
	| "design_review"
	| "final_acceptance"
	| "security_decision"
	| "scope_approval"
	| "merge_approval";

export type GateChoice =
	| { kind: "approve"; label: string }
	| { kind: "revise"; label: string; promptForGuidance: true }
	| { kind: "escalate"; label: string; targetRole?: string };

export interface GateRequest {
	gateId: string;
	runId: string;
	stageId: string;
	type: GateType;
	prompt: string;
	context: string;
	choices: GateChoice[];
	requiresAuthor?: AuthorAttribution;
	createdAt: string;
}

export interface GateResponse {
	gateId: string;
	runId: string;
	decision: "approved" | "revision_requested" | "escalated";
	guidanceText?: string;
	decidedBy: AuthorAttribution;
	decidedAt: string;
}

export interface MockupBundle {
	bundleId: string;
	runId: string;
	stageId: string;
	mockups: Mockup[];
	approvalState: "pending" | "approved" | "partial" | "revisions_requested";
	revisionCount: number;
}

export interface Mockup {
	path: string;
	index: number;
	caption?: string;
	generatedAt: string;
	approvedAt?: string;
	revisionRequestedAt?: string;
	revisionGuidance?: string;
	prompt?: string;
	size?: string;
}

export interface StaleStateNotice {
	surface?: string;
	lastSeenAt?: string;
	upstreamCommit?: string;
	changedAt?: string;
	changedBy?: AuthorAttribution;
	changeSummary?: string;
	affectsCurrentDialogue?: boolean;
	sourcePath?: string;
	previousUpdatedAt?: string;
	currentUpdatedAt?: string;
	summary?: string;
	acknowledged?: boolean;
}

export interface DependencyEdge {
	from: string;
	to: string;
	state: "pending" | "satisfied" | "broken";
	reason?: string;
}

export interface DependencyGraph {
	nodes: WorkOrderListItem[];
	edges: DependencyEdge[];
	parallelCohorts: string[][];
	blockedQueue: string[];
}

export interface DialogueTurn {
	turnId: string;
	surfaceId: string;
	dialogueId: string;
	role: "operator" | "agent";
	author: string;
	agentRole?: string;
	text: string;
	attachedMockups?: MockupBundle;
	attachedGate?: GateRequest;
	timestamp: string;
}

export type CoordinatorToolKind =
	| "spawn_deck"
	| "spawn_wo"
	| "run_wo"
	| "approve_gate"
	| "dispatch_subagent"
	| "generate_handoff"
	| "resolve_blocker"
	| "surface_reference"
	| "render_pipeline_strip"
	| "update_right_rail_item"
	| "start_research_intake"
	| "record_decision"
	| "capture_lesson_candidate";

export type CoordinatorToolRisk = "low" | "medium" | "high";

export type CoordinatorToolApproval =
	| "auto_allowed"
	| "operator_required"
	| "operator_approved"
	| "operator_rejected";

export interface CoordinatorToolCall {
	toolCallId: string;
	kind: CoordinatorToolKind;
	projectId: string;
	requestedBy: AuthorAttribution;
	rationale: string;
	references: ArtifactReference[];
	risk: CoordinatorToolRisk;
	approval: CoordinatorToolApproval;
	payload: Record<string, unknown>;
	createsRightRailItem?: RightRailItemKind;
	gate?: GateRequest;
	createdAt: string;
}

export interface CoordinatorToolResult {
	toolCallId: string;
	status: "completed" | "failed" | "canceled" | "awaiting_operator";
	plainEnglishSummary: string;
	technicalDetailsRef?: ArtifactReference;
	createdReferences: ArtifactReference[];
	rightRailUpdates: RightRailItem[];
}

export interface CoordinatorDialogueTurn {
	turnId: string;
	role: "operator" | "agent" | "system";
	author: AuthorAttribution;
	agentRole?: CoordinatorRole | string;
	text: string;
	references: ArtifactReference[];
	toolCalls?: CoordinatorToolCall[];
	createdAt: string;
}

export function toAuthorAttribution(
	author: string | AuthorAttribution,
	role: "operator" | "agent" | "system" = "operator",
	agentRole?: string,
): AuthorAttribution {
	if (typeof author !== "string") {
		return author;
	}

	const normalized = author.trim() || (role === "operator" ? "operator" : "agent");
	const isAgent = role === "agent" || Boolean(agentRole);

	return {
		user: normalized,
		role: agentRole,
		isAgent,
		displayName: normalized,
	};
}

export function dialogueTurnToCoordinatorTurn(
	turn: DialogueTurn,
): CoordinatorDialogueTurn {
	return {
		turnId: turn.turnId,
		role: turn.role,
		author: toAuthorAttribution(turn.author, turn.role, turn.agentRole),
		agentRole: turn.agentRole,
		text: turn.text,
		references: [],
		createdAt: turn.timestamp,
	};
}

export type DialogueAttentionState =
	| "needs_your_reply"
	| "needs_reply"
	| "awaiting_commit"
	| "awaiting_confirmation"
	| "agent_thinking"
	| "idle_exploratory"
	| "shelved"
	| "cascade_pending"
	| "abandoned"
	| "committed_and_resolved"
	| "committed_resolved";

export interface DialogueInventoryItem {
	dialogueId: string;
	surface: string;
	state: DialogueAttentionState;
	lastActivityAt: string;
	preview: string;
	primaryAgent: string;
	participants: AuthorAttribution[];
	isMine: boolean;
	staleStateNotice?: StaleStateNotice;
}

export interface PipelineStage {
	stageId: string;
	role: string;
	label: string;
	estimatedDurationMinutes?: number;
	hasOwnerGate: boolean;
	isParallelizable: boolean;
}

export interface AuditFinding {
	findingId: string;
	severity: "info" | "warning" | "blocker";
	rule: string;
	description: string;
	affectedPaths?: string[];
	recommendation?: string;
	resolvedBy?: "auto" | "operator" | "agent";
}

export interface DomainKnowledgeRetrievalEvidence {
	areasConsulted: string[];
	filesLoaded: Array<{
		path: string;
		bytesLoaded: number;
	}>;
	tokenCountConsumed: number;
	retrievalGaps: Array<{
		area: string;
		surfacedToSteward: boolean;
	}>;
}

export interface SynthesisPacket {
	runId: string;
	workOrderId: string;
	summary: string;
	filesChanged: Array<{
		path: string;
		additions: number;
		deletions: number;
	}>;
	verificationOutputs: Array<{
		command: string;
		status: "pass" | "fail" | "skip";
		output?: string;
	}>;
	lessonCandidates: Array<{
		title: string;
		severity: "low" | "medium" | "high";
	}>;
	domainKnowledgeRetrievalEvidence: DomainKnowledgeRetrievalEvidence;
	auditFindings: AuditFinding[];
	decisionsRecorded: ProposedDecision[];
	branchName: string;
	submoduleChanged: boolean;
}

export type ArtifactReferenceKind =
	| "work_order"
	| "run"
	| "foundation"
	| "decision"
	| "lesson"
	| "role"
	| "brand_atom"
	| "feature"
	| "project"
	| "intake"
	| "receipt"
	| "deck"
	| "slide"
	| "other";

export interface ArtifactReference {
	referenceId: string;
	kind: ArtifactReferenceKind;
	label: string;
	projectId?: string;
	path?: string;
	route?: string;
	sourceSection?: string;
	summary?: string;
}

export type DeckLifecycleState =
	| "draft"
	| "generation_requested"
	| "in_review"
	| "revision_requested"
	| "approved"
	| "export_ready";

export type DeckSlideApprovalState =
	| "draft"
	| "needs_revision"
	| "review_passed"
	| "approved";

export type DeckExportFormat = "html" | "pdf";

export type DeckExportStatus =
	| "not_requested"
	| "ready"
	| "browser_print_required"
	| "failed";

export interface DeckCommentTarget {
	targetId: string;
	label: string;
	line: number;
	column: number;
	hint?: string;
}

export interface DeckSlideSummary {
	slideId: string;
	index: number;
	title: string;
	summary: string;
	approvalState: DeckSlideApprovalState;
	previewHtml?: string;
	commentTargets: DeckCommentTarget[];
	updatedAt: string;
}

export interface DeckApprovalState {
	deck: "draft" | "pending_operator" | "approved";
	slides: Record<string, DeckSlideApprovalState>;
	finalGate?: GateRequest;
	approvedBy?: AuthorAttribution;
	approvedAt?: string;
}

export interface DeckExportRecord {
	format: DeckExportFormat;
	status: DeckExportStatus;
	path?: string;
	requestedAt: string;
	completedAt?: string;
	summary: string;
}

export interface DeckSummary {
	deckId: string;
	projectId: string;
	title: string;
	scope: string;
	audience: string;
	status: DeckLifecycleState;
	ownerPath: string;
	dialoguePath: string;
	slideCount: number;
	updatedAt: string;
	approvalState: DeckApprovalState;
	exportRecords: DeckExportRecord[];
}

export interface DeckDetail extends DeckSummary {
	slides: DeckSlideSummary[];
	revisionEvents: DeckRevisionEvent[];
	references: ArtifactReference[];
	authorRole: "DECK_AUTHOR";
	reviewerRole: "DECK_REVIEWER";
}

export interface DeckRevisionComment {
	commentId?: string;
	text: string;
	line: number;
	column: number;
	targetLabel?: string;
	hint?: string;
}

export interface DeckRevisionEvent {
	eventId: string;
	type:
		| "deck_spawn_requested"
		| "author_dispatch_requested"
		| "reviewer_dispatch_requested"
		| "slide_comment_added"
		| "revision_requested"
		| "slide_approved"
		| "deck_approved"
		| "export_requested"
		| "export_completed"
		| "export_gap_carried_forward";
	projectId: string;
	deckId: string;
	slideId?: string;
	summary: string;
	comment?: DeckRevisionComment;
	markerId?: string;
	sourcePath?: string;
	createdAt: string;
	references: ArtifactReference[];
}

export interface DeckProgressEvent {
	type: "snapshot" | "event";
	deck?: DeckDetail;
	event?: DeckRevisionEvent;
}

export type CoordinatorRole = "PROJECT_COORDINATOR" | "UIUX_COORDINATOR";
export type CoordinatorHandoffKind = "pc_to_uiux" | "uiux_to_pc" | "pc_to_pc";

export interface CoordinatorEndpoint {
	projectId: string;
	coordinatorRole: CoordinatorRole;
	dialoguePath: string;
}

export interface CoordinatorHandoff {
	handoffId: string;
	kind: CoordinatorHandoffKind;
	status: "draft" | "pending_operator" | "accepted" | "returned" | "closed";
	from: CoordinatorEndpoint;
	to: CoordinatorEndpoint;
	createdBy: AuthorAttribution;
	createdAt: string;
	summary: string;
	requestedAction: string;
	references: ArtifactReference[];
	returnSummary?: string;
	decidedBy?: AuthorAttribution;
	decidedAt?: string;
}

export type RightRailItemKind =
	| "pending_action"
	| "running_work"
	| "recently_completed"
	| "blocked_or_error"
	| "reference"
	| "handoff";

export interface RightRailItem {
	itemId: string;
	kind: RightRailItemKind;
	title: string;
	summary: string;
	priority: "ambient" | "proactive" | "interrupting";
	references: ArtifactReference[];
	updatedAt: string;
	expanded: boolean;
	runState?: RunState;
	gate?: GateRequest;
	mockups?: MockupBundle;
	mergePacket?: SynthesisPacket;
	staleStateNotice?: StaleStateNotice;
	handoff?: CoordinatorHandoff;
}

export interface RightRailState {
	projectId: string;
	coordinatorRole: CoordinatorRole;
	activeItemId?: string;
	items: RightRailItem[];
	collapsed: boolean;
	persistsAcrossModes: true;
}

export type CoordinatorMode =
	| "general"
	| "work_order_execution"
	| "research_intake"
	| "uiux"
	| "onboarding_handoff"
	| "review";

export interface CoordinatorSurfaceContext {
	projectId: string;
	coordinatorRole: CoordinatorRole;
	activeMode: CoordinatorMode;
	activeDialogueId: string;
	historyPath: string;
	rightRail: RightRailState;
	currentReferences: ArtifactReference[];
}

export interface HyperlinkedEntityMention {
	mentionId: string;
	dialogueId: string;
	turnId: string;
	displayText: string;
	reference: ArtifactReference;
	expansionTarget: "right_rail";
	insertedBy: AuthorAttribution;
}

export type BrandAtomType =
	| "html-reference"
	| "component-spec"
	| "token"
	| "principle"
	| "voice"
	| "accessibility"
	| "iconography"
	| "gap"
	| "workflow"
	| "other";

export interface BrandAtomListItem {
	atom_path: string;
	path: string;
	type: BrandAtomType;
	name: string;
	modified_at?: string;
	consumer_count?: number;
}

export interface BrandAtomConsumer {
	wo_id: string;
	status?: string;
	title: string;
	last_updated?: string;
	source_relative_path: string;
}

export interface BrandAtomCoverage {
	total_atoms: number;
	atoms_with_consumers: number;
	atoms_without_consumers: string[];
	top_consumed_atoms: Array<{
		atom_path: string;
		consumer_count: number;
		consumers: string[];
	}>;
}

export interface BrandAtomConsumptionReceiptBlock {
	component_specs_cited: string[];
	tokens_consumed: string[];
	hex_literals_introduced: number;
}

export type BrandAtomGapSeverity = "info" | "warning" | "blocker";

export interface BrandAtomGapFinding {
	finding_id: string;
	severity: BrandAtomGapSeverity;
	pattern_description: string;
	introduced_at: string;
	rationale: string;
	follow_on_action: "Add to atoms via Path A" | string;
	surfaced_to_curator: boolean;
	rule?: string;
	source_receipt?: string;
	run_id?: string;
	work_order_id?: string;
	resolved_by_atom_commit?: string;
}

export interface CssVariableUsage {
	token_name: string;
	variable_name: string;
	total_matches: number;
	usages: Array<{
		file_path: string;
		line: number;
		preview: string;
	}>;
}
