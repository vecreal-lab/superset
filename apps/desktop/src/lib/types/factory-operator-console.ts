export interface AuthorAttribution {
	user: string;
	role?: string;
	isAgent: boolean;
	displayName: string;
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

export interface DialogueInventoryItem {
	dialogueId: string;
	surface: string;
	state: DialogueAttentionState;
	lastActivityAt: string;
	preview: string;
	primaryAgent: string;
	participants: AuthorAttribution[];
	isMine: boolean;
}

export interface FactoryWorkspaceContext {
	workspaceId: string;
	projectId: string;
	currentOperatorId: string;
	currentOperatorDisplayName: string;
}
