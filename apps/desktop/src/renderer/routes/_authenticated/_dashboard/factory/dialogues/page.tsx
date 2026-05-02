import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useActiveProjectId } from "renderer/stores/active-project";
import { LDPInbox } from "../components/LDPInbox";
import { LDPSurface } from "../components/LDPSurface";
import type {
	LDPDialogueAgent,
	LDPDialogueTurn,
	LDPStatusSummary,
} from "../components/LDPSurface";
import { useDialogueAttentionCounts } from "../hooks/useDialogueAttentionCounts";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/dialogues/",
)({
	component: DialoguesPage,
});

const primaryAgent: LDPDialogueAgent = {
	name: "ORCH",
	roleId: "ORCH",
	description:
		"Routes operator attention across active project dialogues and escalation points.",
};

function DialoguesPage() {
	const activeProjectId = useActiveProjectId();
	const { counts } = useDialogueAttentionCounts();
	const startTurn = electronTrpc.factory.dialogue.startTurn.useMutation();
	const [inputValue, setInputValue] = useState("");
	const [turns, setTurns] = useState<LDPDialogueTurn[]>([]);
	const status: LDPStatusSummary = {
		kind: "composite",
		label: "Dialogue inventory",
		state: counts.total > 0 ? "needs_reply" : "idle_exploratory",
		primaryAgent: primaryAgent.roleId,
		lastUpdated: counts.items[0]?.last_activity_at,
		metrics: [
			{ label: "High-attention", value: counts.total, tone: counts.total > 0 ? "warning" : "success" },
			{ label: "Needs reply", value: counts.by_state.needs_reply || 0 },
			{ label: "Awaiting commit", value: counts.by_state.awaiting_commit || 0 },
			{
				label: "Awaiting confirmation",
				value: counts.by_state.awaiting_confirmation || 0,
			},
		],
		flags: [{ label: `Active project: ${activeProjectId}` }],
	};

	async function handleSubmit() {
		const message = inputValue.trim();
		if (!message) return;
		setInputValue("");
		const result = await startTurn.mutateAsync({
			project: activeProjectId,
			surface: "dialogues",
			message,
			title: "Dialogue inbox focus question",
		});
		setTurns(
			result.messages.map((turn) => ({
				id: turn.id,
				kind: turn.kind,
				speaker: turn.speaker,
				roleId: turn.role_id,
				content: turn.content,
				timestamp: turn.created_at,
			})),
		);
	}

	return (
		<LDPSurface
			title="Dialogues"
			description="Active-project inventory of LDP conversations, attention states, and lifecycle actions."
			status={status}
			primaryAgent={primaryAgent}
			turns={turns}
			inputValue={inputValue}
			inputPlaceholder="Ask ORCH what dialogue needs attention first"
			isThinking={startTurn.isPending}
			onInputChange={setInputValue}
			onSubmit={handleSubmit}
			readPane={<LDPInbox />}
		/>
	);
}
