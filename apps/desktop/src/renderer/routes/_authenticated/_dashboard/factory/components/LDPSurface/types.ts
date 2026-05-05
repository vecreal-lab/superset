import type { ReactNode } from "react";

export type LDPSurfaceKind = "document" | "read_model" | "composite" | "foundation";

export type LDPDialogueState =
	| "idle"
	| "in_dialogue"
	| "confirmation_requested"
	| "committing"
	| "post_commit"
	| "abandoned";

export type LDPInventoryState =
	| "needs_reply"
	| "awaiting_commit"
	| "awaiting_confirmation"
	| "agent_thinking"
	| "idle_exploratory"
	| "shelved"
	| "cascade_pending"
	| "abandoned"
	| "committed_resolved";

export type LDPMetricTone = "default" | "success" | "warning" | "danger";

export interface LDPStatusMetric {
	label: string;
	value: string | number;
	tone?: LDPMetricTone;
}

export interface LDPStatusFlag {
	label: string;
	tone?: LDPMetricTone;
}

export interface ProjectOwnerSummary {
	owner: string;
	label: string;
	sourcePath?: string;
	isShared?: boolean;
}

export interface LDPStatusSummary {
	kind: LDPSurfaceKind;
	label: string;
	state: LDPDialogueState | LDPInventoryState;
	sourcePath?: string;
	lastUpdated?: string;
	primaryAgent: string;
	projectOwner?: string | ProjectOwnerSummary;
	projectId?: string;
	metrics: LDPStatusMetric[];
	flags?: LDPStatusFlag[];
}

export interface LDPAuthorAttribution {
	user: string;
	role?: string;
	isAgent: boolean;
	displayName: string;
}

export interface LDPDialogueAgent {
	name: string;
	roleId: string;
	description?: string;
}

export type LDPTurnKind = "operator" | "agent" | "specialist" | "system";

export interface LDPDialogueTurn {
	id: string;
	kind: LDPTurnKind;
	speaker: string;
	roleId?: string;
	author?: LDPAuthorAttribution;
	content: string;
	timestamp?: string;
}

export interface LDPCascadeDraft {
	id: string;
	title: string;
	href: string;
	status: string;
	summary?: string;
}

export interface LDPStaleStateNotice {
	surface: string;
	lastSeenAt: string;
	changedAt?: string;
	changedBy?: LDPAuthorAttribution;
	changeSummary: string;
	affectsCurrentDialogue: boolean;
}

export interface LDPSurfaceProps {
	title: string;
	description: string;
	status: LDPStatusSummary;
	primaryAgent: LDPDialogueAgent;
	turns: LDPDialogueTurn[];
	readPane: ReactNode;
	visualDiffPane?: ReactNode;
	staleStateNotice?: LDPStaleStateNotice | null;
	inputValue: string;
	inputPlaceholder?: string;
	isThinking?: boolean;
	thinkingLabel?: string;
	cascadeDrafts?: LDPCascadeDraft[];
	onInputChange: (value: string) => void;
	onSubmit: () => void;
}
