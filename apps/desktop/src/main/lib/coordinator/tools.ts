import { randomUUID } from "node:crypto";
import type {
	ArtifactReference,
	AuthorAttribution,
	GateRequest,
	RightRailItem,
	RightRailItemKind,
} from "lib/types/factory-operator-console";

export const COORDINATOR_TOOL_KINDS = [
	"spawn_wo",
	"run_wo",
	"approve_gate",
	"dispatch_subagent",
	"generate_handoff",
	"resolve_blocker",
	"surface_reference",
	"render_pipeline_strip",
	"update_right_rail_item",
	"start_research_intake",
	"record_decision",
	"capture_lesson_candidate",
] as const;

export type CoordinatorToolKind = (typeof COORDINATOR_TOOL_KINDS)[number];
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

export interface CreateCoordinatorToolCallInput {
	kind: CoordinatorToolKind;
	projectId: string;
	requestedBy: AuthorAttribution;
	rationale: string;
	references?: ArtifactReference[];
	risk?: CoordinatorToolRisk;
	payload?: Record<string, unknown>;
	createdAt?: string;
}

const HIGH_STAKES_TOOL_KINDS = new Set<CoordinatorToolKind>([
	"spawn_wo",
	"run_wo",
	"approve_gate",
	"dispatch_subagent",
	"generate_handoff",
	"resolve_blocker",
	"start_research_intake",
]);

export function isHighStakesTool(
	kind: CoordinatorToolKind,
	risk: CoordinatorToolRisk = "medium",
): boolean {
	return risk === "high" || HIGH_STAKES_TOOL_KINDS.has(kind);
}

export function createCoordinatorToolCall(
	input: CreateCoordinatorToolCallInput,
): CoordinatorToolCall {
	const risk = input.risk ?? defaultRiskForTool(input.kind);
	const operatorRequired = isHighStakesTool(input.kind, risk);
	const createdAt = input.createdAt ?? new Date().toISOString();
	const base: CoordinatorToolCall = {
		toolCallId: `tool-${randomUUID()}`,
		kind: input.kind,
		projectId: input.projectId,
		requestedBy: input.requestedBy,
		rationale: input.rationale,
		references: input.references ?? [],
		risk,
		approval: operatorRequired ? "operator_required" : "auto_allowed",
		payload: input.payload ?? {},
		createsRightRailItem: operatorRequired ? "pending_action" : undefined,
		createdAt,
	};

	if (operatorRequired) {
		return {
			...base,
			gate: createGateForToolCall(base),
		};
	}

	return base;
}

export function createGateForToolCall(toolCall: CoordinatorToolCall): GateRequest {
	const title = labelForToolKind(toolCall.kind);
	return {
		gateId: `gate-${toolCall.toolCallId}`,
		runId: `coordinator-${toolCall.projectId}`,
		stageId: "project-coordinator-tool-approval",
		type: toolCall.kind === "approve_gate" ? "final_acceptance" : "scope_approval",
		prompt: `${title} needs your approval before anything changes.`,
		context: toolCall.rationale,
		choices: [
			{ kind: "approve", label: "Approve" },
			{ kind: "revise", label: "Revise", promptForGuidance: true },
			{ kind: "escalate", label: "Ask for more context" },
		],
		requiresAuthor: toolCall.requestedBy,
		createdAt: toolCall.createdAt,
	};
}

export function createRightRailItemForToolCall(
	toolCall: CoordinatorToolCall,
): RightRailItem {
	return {
		itemId: `rail-${toolCall.toolCallId}`,
		kind: "pending_action",
		title: labelForToolKind(toolCall.kind),
		summary: toolCall.rationale,
		priority: "interrupting",
		references: toolCall.references,
		updatedAt: toolCall.createdAt,
		expanded: true,
		gate: toolCall.gate ?? createGateForToolCall(toolCall),
	};
}

export function labelForToolKind(kind: CoordinatorToolKind): string {
	switch (kind) {
		case "spawn_wo":
			return "Spawn work order";
		case "run_wo":
			return "Run work order";
		case "approve_gate":
			return "Approve gate";
		case "dispatch_subagent":
			return "Dispatch subagent";
		case "generate_handoff":
			return "Generate handoff";
		case "resolve_blocker":
			return "Resolve blocker";
		case "surface_reference":
			return "Surface reference";
		case "render_pipeline_strip":
			return "Render pipeline strip";
		case "update_right_rail_item":
			return "Update right rail item";
		case "start_research_intake":
			return "Start research intake";
		case "record_decision":
			return "Record decision";
		case "capture_lesson_candidate":
			return "Capture lesson candidate";
	}
}

export function defaultRiskForTool(kind: CoordinatorToolKind): CoordinatorToolRisk {
	if (HIGH_STAKES_TOOL_KINDS.has(kind)) return "high";
	if (kind === "record_decision") return "medium";
	return "low";
}

export function inferToolKindFromMessage(
	message: string,
): CoordinatorToolKind | undefined {
	const normalized = message.toLowerCase();
	if (/\bspawn\b.*\bwo\b|\bcreate\b.*\bwork order\b/.test(normalized)) {
		return "spawn_wo";
	}
	if (/\brun\b.*\bwo\b|\bexecute\b.*\bwork order\b/.test(normalized)) {
		return "run_wo";
	}
	if (/\bapprove\b.*\bgate\b/.test(normalized)) return "approve_gate";
	if (/\bdispatch\b.*\bagent\b|\bsubagent\b/.test(normalized)) {
		return "dispatch_subagent";
	}
	if (/\bhandoff\b/.test(normalized)) return "generate_handoff";
	if (/\bresolve\b.*\bblocker\b/.test(normalized)) return "resolve_blocker";
	if (/\bresearch intake\b/.test(normalized)) return "start_research_intake";
	if (/\brecord\b.*\bdecision\b/.test(normalized)) return "record_decision";
	if (/\blesson candidate\b/.test(normalized)) return "capture_lesson_candidate";
	return undefined;
}
