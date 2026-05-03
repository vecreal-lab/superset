import { Button } from "@superset/ui/button";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer/MarkdownRenderer";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	projectFoundationPath,
	useActiveProjectId,
} from "renderer/stores/active-project";
import {
	applyFoundationLockDate,
	foundationSurfaceFromPath,
} from "shared/factory-foundation-class";
import {
	LDPSurface,
	type LDPAuthorAttribution,
	type LDPDialogueTurn,
	type LDPStatusSummary,
	type LDPStaleStateNotice,
} from "../components/LDPSurface";
import { LDPVisualDiff } from "../components/LDPVisualDiff";
import { EmptyFactoryState, formatDate } from "../components/FactoryView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/foundations/",
)({
	validateSearch: (search) => ({
		dialogueId:
			typeof search.dialogueId === "string" ? search.dialogueId : undefined,
	}),
	component: FoundationsPage,
});

const FOUNDATION_AGENT = {
	name: "DOMAIN_KNOWLEDGE_STEWARD",
	roleId: "DOMAIN_KNOWLEDGE_STEWARD",
	description:
		"Primary foundation-class steward. STRATEGY_STEWARD is attributed on impact analysis.",
};

const FOUNDATION_SURFACES = [
	{ id: "index", label: "Index", fileName: "INDEX.md" },
	{ id: "identity", label: "Identity", fileName: "identity.md" },
	{
		id: "operating-principles",
		label: "Operating Principles",
		fileName: "operating-principles.md",
	},
	{ id: "factory-phases", label: "Factory Phases", fileName: "factory-phases.md" },
] as const;

type FoundationSurfaceId = (typeof FOUNDATION_SURFACES)[number]["id"];

type FoundationStreamEvent =
	| {
			type: "dialogue" | "complete";
			dialogue: { id: string; state: string };
			messages: Parameters<typeof mapTurns>[0];
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
			message: Parameters<typeof mapTurns>[0][number];
			dialogue: { id: string; state: string };
			messages: Parameters<typeof mapTurns>[0];
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

interface PendingDraft {
	before: string;
	after: string;
	reason: string;
	createdAt: string;
}

interface PendingTurn {
	key: string;
	dialogueId?: string;
	message: string;
	previousState?: string;
	draft: PendingDraft | null;
}

function countSections(content: string): number {
	return content.match(/^##\s+/gm)?.length ?? 0;
}

function countLockDates(content: string): number {
	return content.match(/\blocked\b|\bLock-date:/gi)?.length ?? 0;
}

function isConcreteCommit(message: string): boolean {
	return /\b(approved|approve|confirm|confirmed|ship it|do it|go|commit)\b/i.test(
		message,
	);
}

function extractFoundationDraft(
	message: string,
	currentContent: string,
): PendingDraft | null {
	const match = /```foundation-draft\s*\n([\s\S]*?)```/i.exec(message);
	if (!match?.[1]?.trim()) return null;
	const lockDate = applyFoundationLockDate(match[1].trimEnd().concat("\n"), new Date().toISOString());
	return {
		before: currentContent,
		after: lockDate.content,
		reason: message.replace(match[0], "").trim() || "Foundation-class draft supplied by operator.",
		createdAt: new Date().toISOString(),
	};
}

function dialogueStateForStatus(state?: string): LDPStatusSummary["state"] {
	return (state as LDPStatusSummary["state"] | undefined) || "idle";
}

function mapTurns(messages: Array<{
	id: string;
	kind: LDPDialogueTurn["kind"];
	speaker: string;
	role_id?: string;
	author?: LDPAuthorAttribution;
	content: string;
	created_at: string;
}>): LDPDialogueTurn[] {
	return messages.map((message) => ({
		id: message.id,
		kind: message.kind,
		speaker: message.speaker,
		roleId: message.role_id,
		author: message.author,
		content: message.content,
		timestamp: message.created_at,
	}));
}

function FoundationTurnSubscription({
	turn,
	project,
	surface,
	documentPath,
	onEvent,
	onError,
}: {
	turn: PendingTurn;
	project: string;
	surface: string;
	documentPath: string;
	onEvent: (event: FoundationStreamEvent) => void;
	onError: (error: unknown) => void;
}) {
	electronTrpc.factory.dialogue.sendTurn.useSubscription(
		{
			project,
			surface,
			dialogueId: turn.dialogueId,
			title: "Foundation-class dialogue",
			message: turn.message,
			documentPath,
		},
		{
			onData: (event) => onEvent(event as FoundationStreamEvent),
			onError,
		},
	);
	return null;
}

function FoundationsPage() {
	const activeProjectId = useActiveProjectId();
	const search = Route.useSearch();
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();
	const previousProjectRef = useRef(activeProjectId);
	const [selectedSurfaceId, setSelectedSurfaceId] =
		useState<FoundationSurfaceId>("index");
	const selectedSurface = FOUNDATION_SURFACES.find(
		(surface) => surface.id === selectedSurfaceId,
	)!;
	const workspaceContext = useMemo(
		() => ({
			workspaceId: activeProjectId,
			projectsRoot: "projects",
			isMultiUser: false,
		}),
		[activeProjectId],
	);
	const documentPath = projectFoundationPath(
		workspaceContext.workspaceId,
		selectedSurface.fileName,
	);
	const dialogueSurface = foundationSurfaceFromPath(documentPath);
	const [inputValue, setInputValue] = useState("");
	const [localDialogueId, setLocalDialogueId] = useState<string | null>(null);
	const [pendingDraft, setPendingDraft] = useState<PendingDraft | null>(null);
	const [pendingTurn, setPendingTurn] = useState<PendingTurn | null>(null);
	const [streamingTurns, setStreamingTurns] = useState<LDPDialogueTurn[]>([]);
	const [thinkingLabel, setThinkingLabel] = useState<string | undefined>();
	const documentQuery = electronTrpc.factory.document.useQuery(
		{ path: documentPath },
		{ refetchInterval: 5000 },
	);
	const ownerPolicyQuery = electronTrpc.factory.dialogue.foundationOwnerPolicy.useQuery(
		{ documentPath },
		{ refetchInterval: 5000 },
	);
	const activeDialogueId = search.dialogueId || localDialogueId || undefined;
	const dialogueQuery = electronTrpc.factory.dialogue.get.useQuery(
		{
			project: activeProjectId,
			surface: dialogueSurface,
			dialogueId: activeDialogueId || "__none__",
		},
		{ enabled: Boolean(activeDialogueId), refetchInterval: 5000 },
	);
	const commitMutation = electronTrpc.factory.dialogue.commit.useMutation();
	const rawContent = documentQuery.data?.content || "";
	const content = rawContent.trimEnd();
	const ownerPolicy = ownerPolicyQuery.data;
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
	const staleStateNotice = useMemo<LDPStaleStateNotice | null>(() => {
		if (!pendingDraft || rawContent === pendingDraft.before) return null;
		return {
			surface: dialogueSurface,
			lastSeenAt: pendingDraft.createdAt,
			changedAt: documentQuery.data?.modified_at || undefined,
			changeSummary:
				"The foundation file changed after this draft was prepared. Refresh the review before approving so the owner sees the latest text.",
			affectsCurrentDialogue: true,
		};
	}, [dialogueSurface, documentQuery.data?.modified_at, pendingDraft, rawContent]);
	const cascadeDrafts = useMemo(() => {
		const dialogue = dialogueQuery.data?.dialogue;
		if (!dialogue || dialogue.state !== "cascade_pending") return [];
		const cascadeId = `WO-LDP-CASCADE-${dialogue.id.slice(0, 8).toUpperCase()}`;
		return [
			{
				id: cascadeId,
				title: `Cascade from ${selectedSurface.label}`,
				href: `/factory/work-orders/${cascadeId}`,
				status: "queued",
				summary:
					"Foundation-class commit recorded. Review generated cascade draft artifacts before implementation.",
			},
			{
				id: "approval-queue",
				title: "Approval Queue",
				href: "/factory/approvals",
				status: "operator",
				summary: "Use approvals for generated cascade work-order gates.",
			},
		];
	}, [dialogueQuery.data?.dialogue, selectedSurface.label]);

	useEffect(() => {
		if (previousProjectRef.current === activeProjectId) return;
		previousProjectRef.current = activeProjectId;
		resetDialogueState();
		if (search.dialogueId) {
			void navigate({
				to: "/factory/foundations",
				search: { dialogueId: undefined },
				replace: true,
			});
		}
	}, [activeProjectId, navigate, search.dialogueId]);

	function resetDialogueState() {
		setLocalDialogueId(null);
		setPendingDraft(null);
		setPendingTurn(null);
		setStreamingTurns([]);
		setThinkingLabel(undefined);
	}

	function selectSurface(surfaceId: FoundationSurfaceId) {
		setSelectedSurfaceId(surfaceId);
		resetDialogueState();
		if (search.dialogueId) {
			void navigate({
				to: "/factory/foundations",
				search: { dialogueId: undefined },
				replace: true,
			});
		}
	}

	async function refreshFoundationQueries() {
		await Promise.all([
			documentQuery.refetch(),
			utils.factory.dialogue.get.invalidate(),
			utils.factory.dialogue.list.invalidate(),
			utils.factory.dialogue.attentionCounts.invalidate(),
			utils.factory.dialogue.foundationOwnerPolicy.invalidate(),
			utils.factory.cli.status.invalidate(),
		]);
	}

	async function maybeCommitAfterConcreteApproval(
		dialogueId: string,
		message: string,
		previousState?: string,
		draft?: PendingDraft | null,
	): Promise<void> {
		if (!isConcreteCommit(message)) return;
		if (
			previousState !== "awaiting_commit" &&
			previousState !== "awaiting_confirmation"
		) {
			return;
		}
		if (!draft) {
			setStreamingTurns((previous) => [
				...previous,
				{
					id: `foundation-commit-blocked-${Date.now()}`,
					kind: "system",
					speaker: "Cockpit",
					content:
						"I need a complete draft and visible diff before I can write a foundation file.",
					timestamp: new Date().toISOString(),
				},
			]);
			return;
		}
		if (!ownerPolicy) {
			setStreamingTurns((previous) => [
				...previous,
				{
					id: `foundation-owner-policy-missing-${Date.now()}`,
					kind: "system",
					speaker: "Cockpit",
					content:
						"I need the project owner policy before I can write a foundation file. Refresh this surface and try again.",
					timestamp: new Date().toISOString(),
				},
			]);
			return;
		}
		await commitMutation.mutateAsync({
			project: activeProjectId,
			surface: dialogueSurface,
			dialogueId,
			notes: message,
			operatorName: ownerPolicy.requiredOwner,
			operatorReason: draft.reason || message,
			visualDiffConfirmed: true,
			documentPath,
			documentBefore: draft.before,
			documentAfter: draft.after,
		});
		setPendingDraft(null);
		await refreshFoundationQueries();
	}

	async function handleSubmit() {
		const message = inputValue.trim();
		if (!message) return;
		setInputValue("");
		const draft = extractFoundationDraft(message, rawContent);
		if (draft && draft.after !== rawContent) setPendingDraft(draft);
		const previousState = dialogueQuery.data?.dialogue.state;
		setThinkingLabel(`${FOUNDATION_AGENT.roleId} is thinking...`);
		setPendingTurn({
			key: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
			dialogueId: activeDialogueId,
			message,
			previousState,
			draft: draft && draft.after !== rawContent ? draft : pendingDraft,
		});
	}

	async function handleStreamEvent(event: FoundationStreamEvent) {
		if (event.type === "dialogue") {
			setLocalDialogueId(event.dialogue.id);
			setStreamingTurns(mapTurns(event.messages));
			if (!activeDialogueId) {
				await navigate({
					to: "/factory/foundations",
					search: { dialogueId: event.dialogue.id },
					replace: true,
				});
			}
			return;
		}
		if (event.type === "status") {
			setThinkingLabel(
				event.phase === "complete" ? undefined : event.message || `${event.roleId} is thinking...`,
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
			const completedTurn = pendingTurn;
			setThinkingLabel(undefined);
			setPendingTurn(null);
			await refreshFoundationQueries();
			if (completedTurn) {
				await maybeCommitAfterConcreteApproval(
					event.dialogue.id,
					completedTurn.message,
					completedTurn.previousState,
					completedTurn.draft,
				);
			}
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

	const surfaceSelector = (
		<div className="flex flex-wrap gap-2 border-b pb-4">
			{FOUNDATION_SURFACES.map((surface) => (
				<Button
					key={surface.id}
					type="button"
					variant={surface.id === selectedSurfaceId ? "secondary" : "outline"}
					size="sm"
					onClick={() => selectSurface(surface.id)}
				>
					{surface.label}
				</Button>
			))}
		</div>
	);

	const readPane = documentQuery.isLoading ? (
		<div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
			Loading {documentPath}...
		</div>
	) : documentQuery.isError ? (
		<div className="rounded-md border border-destructive/40 p-6 text-sm">
			<div className="font-medium text-destructive">Could not load foundation</div>
			<p className="mt-2 text-muted-foreground">
				The cockpit expected <code>{documentPath}</code> for the active project.
			</p>
			<p className="mt-3 font-mono text-xs text-muted-foreground">
				{documentQuery.error.message}
			</p>
		</div>
	) : !content ? (
		<EmptyFactoryState
			title="Foundation source is empty"
			body="This foundation-class view is wired to the active project's foundations folder."
		/>
	) : (
		<div className="space-y-4">
			<div className="border-b pb-4">
				<p className="font-mono text-xs text-muted-foreground">
					{documentQuery.data?.source_relative_path || documentPath}
				</p>
				{documentQuery.data && (
					<p className="mt-1 text-xs text-muted-foreground">
						Modified {formatDate(documentQuery.data.modified_at)} -{" "}
						{documentQuery.data.bytes} bytes
					</p>
				)}
			</div>
			<MarkdownRenderer content={content} className="h-auto overflow-visible" />
		</div>
	);

	return (
		<>
			<LDPSurface
				title="Foundations"
				description="Foundation-class living documents with owner-only commit gates, holistic review, visual diff, and cascade drafting."
				status={{
					kind: "foundation",
					label: selectedSurface.label,
					state: dialogueStateForStatus(dialogueQuery.data?.dialogue.state),
					sourcePath: documentQuery.data?.source_relative_path || documentPath,
					lastUpdated: formatDate(documentQuery.data?.modified_at),
					primaryAgent: FOUNDATION_AGENT.roleId,
					projectOwner: ownerPolicy
						? {
								owner: ownerPolicy.requiredOwner,
								label: ownerPolicy.ownerLabel,
								sourcePath: ownerPolicy.ownerSourcePath,
								isShared: ownerPolicy.isShared,
							}
						: undefined,
					metrics: [
						{ label: "Sections", value: countSections(content) },
						{ label: "Lock markers", value: countLockDates(content) },
						{ label: "Dialogue turns", value: displayedTurns.length },
						{ label: "Workspace", value: workspaceContext.workspaceId },
					],
					flags: [
						{
							label: ownerPolicyQuery.isLoading
								? "Reading owner policy"
								: "Project owner approval required",
							tone: ownerPolicy ? "warning" : "default",
						},
						{ label: "Visual diff ready", tone: pendingDraft ? "success" : "default" },
						{ label: "Cascade drafts required", tone: "default" },
					],
				}}
				primaryAgent={FOUNDATION_AGENT}
				turns={displayedTurns}
				readPane={
					<div className="space-y-4">
						{surfaceSelector}
						{readPane}
					</div>
				}
				visualDiffPane={
					pendingDraft ? (
						<LDPVisualDiff
							before={pendingDraft.before}
							after={pendingDraft.after}
							title="Foundation commit preview"
							beforeLabel={documentPath}
							afterLabel="Draft with lock-date update"
						/>
					) : null
				}
				staleStateNotice={staleStateNotice}
				inputValue={inputValue}
				inputPlaceholder="Ask about this foundation, propose a complete replacement, or approve the pending draft..."
				isThinking={Boolean(pendingTurn) || commitMutation.isPending}
				thinkingLabel={
					commitMutation.isPending
						? "Checking owner approval and writing the foundation update..."
						: thinkingLabel
				}
				cascadeDrafts={cascadeDrafts}
				onInputChange={setInputValue}
				onSubmit={handleSubmit}
			/>
			{pendingTurn && (
				<FoundationTurnSubscription
					turn={pendingTurn}
					project={activeProjectId}
					surface={dialogueSurface}
					documentPath={documentPath}
					onEvent={handleStreamEvent}
					onError={handleStreamError}
				/>
			)}
		</>
	);
}
