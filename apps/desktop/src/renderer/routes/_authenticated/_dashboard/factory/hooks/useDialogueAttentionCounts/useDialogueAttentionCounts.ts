import { electronTrpc } from "renderer/lib/electron-trpc";
import { useActiveProjectId } from "renderer/stores/active-project";
import type {
	AuthorAttribution,
	FactoryWorkspaceContext,
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
	assigned_operator_id: string;
	is_mine: boolean;
	participants: AuthorAttribution[];
}

export interface DialogueAttentionCounts {
	total: number;
	by_project: Record<string, number>;
	by_surface: Record<string, number>;
	by_state: Partial<Record<DialogueState, number>>;
	items: DialogueRecord[];
	operator_id: string;
	workspace_id: string;
}

const CURRENT_OPERATOR_ID = "yuriy";
const CURRENT_OPERATOR_DISPLAY_NAME = "Yuriy";

export function useFactoryWorkspaceContext(): FactoryWorkspaceContext {
	const activeProjectId = useActiveProjectId();
	return {
		workspaceId: activeProjectId,
		projectId: activeProjectId,
		currentOperatorId: CURRENT_OPERATOR_ID,
		currentOperatorDisplayName: CURRENT_OPERATOR_DISPLAY_NAME,
	};
}

export function useDialogueAttentionCounts(surface?: string) {
	const workspace = useFactoryWorkspaceContext();
	const query = electronTrpc.factory.dialogue.attentionCounts.useQuery(
		{
			project: workspace.projectId,
			surface,
			operatorId: workspace.currentOperatorId,
			workspaceId: workspace.workspaceId,
		},
		{ refetchInterval: 5000 },
	);
	const counts = (query.data || {
		total: 0,
		by_project: {},
		by_surface: {},
		by_state: {},
		items: [],
		operator_id: workspace.currentOperatorId,
		workspace_id: workspace.workspaceId,
	}) as DialogueAttentionCounts;

	return {
		...query,
		activeProjectId: workspace.projectId,
		workspace,
		counts,
		countForSurface: (surfaceId: string) => counts.by_surface[surfaceId] || 0,
		mineCountForSurface: (surfaceId: string) =>
			counts.items.filter((item) => item.surface === surfaceId && item.is_mine)
				.length,
		hasMineAttentionForSurface: (surfaceId: string) =>
			counts.items.some((item) => item.surface === surfaceId && item.is_mine),
		itemsForCurrentOperator: counts.items.filter((item) => item.is_mine),
	};
}
