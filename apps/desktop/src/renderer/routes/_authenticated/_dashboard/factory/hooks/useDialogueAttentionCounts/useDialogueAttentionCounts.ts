import { electronTrpc } from "renderer/lib/electron-trpc";
import { useActiveProjectId } from "renderer/stores/active-project";
import type {
	AuthorAttribution,
	StaleStateNotice,
} from "lib/types/factory-operator-console";

export type DialogueState =
	| "needs_reply"
	| "awaiting_commit"
	| "awaiting_confirmation"
	| "agent_thinking"
	| "idle_exploratory"
	| "shelved"
	| "cascade_pending"
	| "abandoned"
	| "committed_resolved";

export interface DialogueRecord {
	id: string;
	project: string;
	surface: string;
	title: string;
	author?: string;
	created_at: string;
	updated_at: string;
	archived: boolean;
	state: DialogueState;
	last_activity_at: string;
	source_path: string;
	source_relative_path: string;
	messages_path: string;
	message_count: number;
	last_message_preview: string;
	primary_agent: string;
	participants: AuthorAttribution[];
	is_mine: boolean;
	stale_state_notice?: StaleStateNotice;
}

export interface DialogueAttentionCounts {
	total: number;
	by_project: Record<string, number>;
	by_surface: Record<string, number>;
	by_state: Partial<Record<DialogueState, number>>;
	items: DialogueRecord[];
}

export function useDialogueAttentionCounts(surface?: string) {
	const activeProjectId = useActiveProjectId();
	const query = electronTrpc.factory.dialogue.attentionCounts.useQuery(
		{ project: activeProjectId, surface },
		{ refetchInterval: 5000 },
	);
	const counts = (query.data || {
		total: 0,
		by_project: {},
		by_surface: {},
		by_state: {},
		items: [],
	}) as DialogueAttentionCounts;

	return {
		...query,
		activeProjectId,
		counts,
		countForSurface: (surfaceId: string) => counts.by_surface[surfaceId] || 0,
	};
}
