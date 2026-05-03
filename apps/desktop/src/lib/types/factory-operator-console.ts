export interface AuthorAttribution {
	user: string;
	role?: string;
	displayName?: string;
	isAgent?: boolean;
}

export interface WorkspaceContext {
	workspaceId: string;
	projectsRoot: string;
	primaryOwner: string;
	repoUrl?: string;
	isMultiUser: boolean;
}

export interface StaleStateNotice {
	surface?: string;
	lastSeenAt?: string;
	currentVersion?: string;
	changedBy?: AuthorAttribution;
	changeSummary?: string;
	affectsCurrentDialogue?: boolean;
	sourcePath?: string;
	summary?: string;
	previousUpdatedAt?: string;
	currentUpdatedAt?: string;
	acknowledged?: boolean;
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
	isMine: boolean;
	participants: AuthorAttribution[];
	staleStateNotice?: StaleStateNotice;
}
