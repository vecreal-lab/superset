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

export interface LDPStatusSummary {
	kind: LDPSurfaceKind;
	label: string;
	state: LDPDialogueState | LDPInventoryState;
	sourcePath?: string;
	lastUpdated?: string;
	primaryAgent: string;
	metrics: LDPStatusMetric[];
	flags?: LDPStatusFlag[];
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

export interface LDPSurfaceProps {
	title: string;
	description: string;
	status: LDPStatusSummary;
	primaryAgent: LDPDialogueAgent;
	turns: LDPDialogueTurn[];
	readPane: ReactNode;
	visualDiffPane?: ReactNode;
	inputValue: string;
	inputPlaceholder?: string;
	isThinking?: boolean;
	thinkingLabel?: string;
	cascadeDrafts?: LDPCascadeDraft[];
	onInputChange: (value: string) => void;
	onSubmit: () => void;
}
