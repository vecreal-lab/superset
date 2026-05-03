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

export interface StaleStateNotice {
	sourcePath: string;
	previousUpdatedAt?: string;
	currentUpdatedAt?: string;
	summary: string;
	acknowledged?: boolean;
}

export type DialogueAttentionState =
	| "needs_reply"
	| "awaiting_commit"
	| "awaiting_confirmation"
	| "agent_thinking"
	| "idle_exploratory"
	| "shelved"
	| "cascade_pending"
	| "abandoned"
	| "committed_resolved";

export interface DialogueTurn {
	turnId: string;
	surfaceId: string;
	dialogueId: string;
	role: "operator" | "agent";
	author: string;
	agentRole?: string;
	text: string;
	timestamp: string;
}

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
