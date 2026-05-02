import { useEffect, useMemo, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type {
	LDPDialogueTurn,
	LDPInventoryState,
	LDPStatusSummary,
} from "./types";

type DialogueMessage = {
	id: string;
	kind: LDPDialogueTurn["kind"];
	speaker: string;
	role_id?: string;
	content: string;
	created_at: string;
};

type DialogueStreamEvent =
	| {
			type: "dialogue" | "complete";
			dialogue: { id: string; state: string };
			messages: DialogueMessage[];
	  }
	| {
			type: "status";
			roleId: string;
			phase: "thinking" | "streaming" | "complete";
			message: string;
	  }
	| {
			type: "chunk";
			roleId: string;
			speaker: string;
			kind: LDPDialogueTurn["kind"];
			content: string;
	  }
	| {
			type: "message";
			message: DialogueMessage;
			dialogue: { id: string; state: string };
			messages: DialogueMessage[];
	  }
	| {
			type: "connection";
			provider: "claude" | "codex";
			status: { message: string };
	  }
	| {
			type: "error";
			provider?: "claude" | "codex";
			roleId?: string;
			message: string;
	  };

interface PendingTurn {
	key: string;
	dialogueId?: string;
	message: string;
}

interface UseLDPSurfaceDialogueInput {
	project: string;
	surface: string;
	title: string;
	initialDialogueId?: string;
	documentPath?: string;
	onDialogueIdChange?: (dialogueId: string | undefined) => void | Promise<void>;
}

function mapTurns(messages: DialogueMessage[]): LDPDialogueTurn[] {
	return messages.map((message) => ({
		id: message.id,
		kind: message.kind,
		speaker: message.speaker,
		roleId: message.role_id,
		content: message.content,
		timestamp: message.created_at,
	}));
}

function SurfaceTurnSubscription({
	turn,
	project,
	surface,
	title,
	documentPath,
	onEvent,
	onError,
}: {
	turn: PendingTurn;
	project: string;
	surface: string;
	title: string;
	documentPath?: string;
	onEvent: (event: DialogueStreamEvent) => void;
	onError: (error: unknown) => void;
}) {
	electronTrpc.factory.dialogue.sendTurn.useSubscription(
		{
			project,
			surface,
			dialogueId: turn.dialogueId,
			title,
			message: turn.message,
			...(documentPath ? { documentPath } : {}),
		},
		{
			onData: (event) => onEvent(event as DialogueStreamEvent),
			onError,
		},
	);
	return null;
}

export function useLDPSurfaceDialogue({
	project,
	surface,
	title,
	initialDialogueId,
	documentPath,
	onDialogueIdChange,
}: UseLDPSurfaceDialogueInput) {
	const utils = electronTrpc.useUtils();
	const previousProjectRef = useRef(project);
	const [inputValue, setInputValue] = useState("");
	const [localDialogueId, setLocalDialogueId] = useState<string | null>(null);
	const [pendingTurn, setPendingTurn] = useState<PendingTurn | null>(null);
	const [streamingTurns, setStreamingTurns] = useState<LDPDialogueTurn[]>([]);
	const [thinkingLabel, setThinkingLabel] = useState<string | undefined>();
	const activeDialogueId = initialDialogueId || localDialogueId || undefined;
	const dialogueQuery = electronTrpc.factory.dialogue.get.useQuery(
		{
			project,
			surface,
			dialogueId: activeDialogueId || "__none__",
		},
		{ enabled: Boolean(activeDialogueId), refetchInterval: 5000 },
	);
	const turns = useMemo(
		() => mapTurns(dialogueQuery.data?.messages || []),
		[dialogueQuery.data?.messages],
	);
	const displayedTurns = useMemo(() => {
		const persistedIds = new Set(turns.map((turn) => turn.id));
		return [
			...turns,
			...streamingTurns.filter((turn) => !persistedIds.has(turn.id)),
		];
	}, [streamingTurns, turns]);

	useEffect(() => {
		if (previousProjectRef.current === project) return;
		previousProjectRef.current = project;
		setLocalDialogueId(null);
		setPendingTurn(null);
		setStreamingTurns([]);
		setThinkingLabel(undefined);
		if (initialDialogueId) {
			void onDialogueIdChange?.(undefined);
		}
	}, [initialDialogueId, onDialogueIdChange, project]);

	async function refreshDialogueQueries() {
		await Promise.all([
			dialogueQuery.refetch(),
			utils.factory.dialogue.get.invalidate(),
			utils.factory.dialogue.list.invalidate(),
			utils.factory.dialogue.attentionCounts.invalidate(),
			utils.factory.cli.status.invalidate(),
		]);
	}

	async function handleSubmit() {
		const message = inputValue.trim();
		if (!message || pendingTurn) return;
		setInputValue("");
		setThinkingLabel("Reading the active project and preparing a response...");
		setPendingTurn({
			key: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
			dialogueId: activeDialogueId,
			message,
		});
	}

	async function handleStreamEvent(event: DialogueStreamEvent) {
		if (event.type === "dialogue") {
			setLocalDialogueId(event.dialogue.id);
			setStreamingTurns(mapTurns(event.messages));
			if (event.dialogue.id !== activeDialogueId) {
				await onDialogueIdChange?.(event.dialogue.id);
			}
			return;
		}
		if (event.type === "status") {
			setThinkingLabel(
				event.phase === "complete"
					? undefined
					: event.message || `${event.roleId} is thinking...`,
			);
			return;
		}
		if (event.type === "chunk" && pendingTurn) {
			setThinkingLabel(`${event.roleId} is answering...`);
			const streamId = `${pendingTurn.key}-${event.roleId}`;
			setStreamingTurns((previous) => {
				const existing = previous.find((turn) => turn.id === streamId);
				if (!existing) {
					return [
						...previous,
						{
							id: streamId,
							kind: event.kind,
							speaker: event.speaker,
							roleId: event.roleId,
							content: event.content,
							timestamp: new Date().toISOString(),
						},
					];
				}
				return previous.map((turn) =>
					turn.id === streamId
						? { ...turn, content: `${turn.content}${event.content}` }
						: turn,
				);
			});
			return;
		}
		if (event.type === "message") {
			setStreamingTurns(mapTurns(event.messages));
			return;
		}
		if (event.type === "connection") {
			await utils.factory.cli.status.invalidate();
			return;
		}
		if (event.type === "error") {
			setStreamingTurns((previous) => [
				...previous,
				{
					id: `error-${Date.now()}`,
					kind: "system",
					speaker: "Cockpit",
					content: event.message,
					timestamp: new Date().toISOString(),
				},
			]);
			setThinkingLabel(undefined);
			setPendingTurn(null);
			await utils.factory.cli.status.invalidate();
			return;
		}
		if (event.type === "complete") {
			setStreamingTurns(mapTurns(event.messages));
			setThinkingLabel(undefined);
			setPendingTurn(null);
			await refreshDialogueQueries();
			setStreamingTurns([]);
		}
	}

	function handleStreamError(error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		setStreamingTurns((previous) => [
			...previous,
			{
				id: `error-${Date.now()}`,
				kind: "system",
				speaker: "Cockpit",
				content: message,
				timestamp: new Date().toISOString(),
			},
		]);
		setThinkingLabel(undefined);
		setPendingTurn(null);
		void utils.factory.cli.status.invalidate();
	}

	const state = (pendingTurn
		? "agent_thinking"
		: dialogueQuery.data?.dialogue.state || "idle_exploratory") as
		| LDPInventoryState
		| LDPStatusSummary["state"];

	return {
		activeDialogueId,
		dialogue: dialogueQuery.data?.dialogue,
		inputValue,
		setInputValue,
		turns: displayedTurns,
		state,
		isThinking: Boolean(pendingTurn),
		thinkingLabel,
		submit: handleSubmit,
		streamElement: pendingTurn ? (
			<SurfaceTurnSubscription
				turn={pendingTurn}
				project={project}
				surface={surface}
				title={title}
				documentPath={documentPath}
				onEvent={handleStreamEvent}
				onError={handleStreamError}
			/>
		) : null,
	};
}
