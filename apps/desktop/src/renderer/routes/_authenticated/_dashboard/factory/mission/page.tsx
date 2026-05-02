import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer/MarkdownRenderer";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	projectFoundationPath,
	useActiveProjectId,
} from "renderer/stores/active-project";
import {
	LDPSurface,
	type LDPDialogueTurn,
	type LDPStatusSummary,
} from "../components/LDPSurface";
import { EmptyFactoryState, formatDate } from "../components/FactoryView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/mission/",
)({
	validateSearch: (search) => ({
		dialogueId:
			typeof search.dialogueId === "string" ? search.dialogueId : undefined,
	}),
	component: MissionPage,
});

const MISSION_AGENT = {
	name: "DOMAIN_KNOWLEDGE_STEWARD",
	roleId: "DOMAIN_KNOWLEDGE_STEWARD",
	description:
		"Primary Mission LDP steward. STRATEGY_STEWARD is attributed on impact analysis.",
};

function countSections(content: string): number {
	return content.match(/^##\s+/gm)?.length ?? 0;
}

function countTktk(content: string): number {
	return content.match(/TKTK/gi)?.length ?? 0;
}

function isChangeProposal(message: string): boolean {
	return /\b(change|edit|update|rewrite|replace|revise|strengthen\w*|weaken\w*|remove|add)\b/i.test(
		message,
	);
}

function isConcreteCommit(message: string): boolean {
	return /\b(approved|approve|confirm|confirmed|ship it|do it|go|commit)\b/i.test(
		message,
	);
}

function appendLdpEditPreview(content: string, message: string): string {
	const marker = "> LDP smoke edit preview:";
	if (content.includes(marker)) return content;
	const cleaned = message.replace(/\s+/g, " ").trim();
	return `${content.trimEnd()}\n\n${marker} ${cleaned || "Mission edit proposed through the LDP loop."}\n`;
}

function removeLdpEditPreview(content: string): string {
	return content
		.replace(/\n*> LDP smoke edit preview:[^\n]*\n?/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trimEnd()
		.concat("\n");
}

function buildPendingDocumentAfter(content: string, message: string): string | null {
	if (!content.trim()) return null;
	if (/\brevert\b/i.test(message) && content.includes("> LDP smoke edit preview:")) {
		return removeLdpEditPreview(content);
	}
	if (isChangeProposal(message)) {
		return appendLdpEditPreview(content, message);
	}
	return null;
}

function dialogueStateForStatus(state?: string): LDPStatusSummary["state"] {
	return (state as LDPStatusSummary["state"] | undefined) || "idle";
}

function mapTurns(messages: Array<{
	id: string;
	kind: LDPDialogueTurn["kind"];
	speaker: string;
	role_id?: string;
	content: string;
	created_at: string;
}>): LDPDialogueTurn[] {
	return messages.map((message) => ({
		id: message.id,
		kind: message.kind,
		speaker: message.speaker,
		roleId: message.role_id,
		content: message.content,
		timestamp: message.created_at,
	}));
}

function MissionPage() {
	const activeProjectId = useActiveProjectId();
	const search = Route.useSearch();
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();
	const missionPath = projectFoundationPath(activeProjectId, "mission.md");
	const previousProjectRef = useRef(activeProjectId);
	const [inputValue, setInputValue] = useState("");
	const [localDialogueId, setLocalDialogueId] = useState<string | null>(null);
	const [pendingDocumentBefore, setPendingDocumentBefore] = useState<string | null>(
		null,
	);
	const [pendingDocumentAfter, setPendingDocumentAfter] = useState<string | null>(
		null,
	);
	const documentQuery = electronTrpc.factory.document.useQuery(
		{ path: missionPath },
		{ refetchInterval: 5000 },
	);
	const activeDialogueId = search.dialogueId || localDialogueId || undefined;
	const dialogueQuery = electronTrpc.factory.dialogue.get.useQuery(
		{
			project: activeProjectId,
			surface: "mission",
			dialogueId: activeDialogueId || "__none__",
		},
		{ enabled: Boolean(activeDialogueId), refetchInterval: 5000 },
	);
	const startTurnMutation = electronTrpc.factory.dialogue.startTurn.useMutation();
	const continueTurnMutation = electronTrpc.factory.dialogue.continueTurn.useMutation();
	const commitMutation = electronTrpc.factory.dialogue.commit.useMutation();
	const content = documentQuery.data?.content.trimEnd() || "";
	const turns = useMemo(
		() => mapTurns(dialogueQuery.data?.messages || []),
		[dialogueQuery.data?.messages],
	);
	const cascadeDrafts = useMemo(() => {
		const dialogue = dialogueQuery.data?.dialogue;
		if (!dialogue || dialogue.state !== "cascade_pending") return [];
		const cascadeId = `WO-LDP-CASCADE-${dialogue.id.slice(0, 8).toUpperCase()}`;
		return [
			{
				id: cascadeId,
				title: `Cascade from Mission dialogue ${dialogue.id.slice(0, 8)}`,
				href: `#/factory/work-orders/${cascadeId}`,
				status: "draft",
				summary:
					"Mission commit recorded. Review downstream impacts before implementation.",
			},
			{
				id: "approval-queue",
				title: "Approval Queue",
				href: "#/factory/approvals",
				status: "operator",
				summary: "Use approvals for any generated cascade work order gate.",
			},
		];
	}, [dialogueQuery.data?.dialogue]);

	useEffect(() => {
		if (previousProjectRef.current === activeProjectId) return;
		previousProjectRef.current = activeProjectId;
		setLocalDialogueId(null);
		setPendingDocumentBefore(null);
		setPendingDocumentAfter(null);
		if (search.dialogueId) {
			void navigate({
				to: "/factory/mission",
				search: { dialogueId: undefined },
				replace: true,
			});
		}
	}, [activeProjectId, navigate, search.dialogueId]);

	async function refreshMissionQueries() {
		await Promise.all([
			documentQuery.refetch(),
			utils.factory.dialogue.get.invalidate(),
			utils.factory.dialogue.list.invalidate(),
			utils.factory.dialogue.attentionCounts.invalidate(),
		]);
	}

	async function maybeCommitAfterConcreteApproval(
		dialogueId: string,
		message: string,
		previousState?: string,
	): Promise<void> {
		if (!isConcreteCommit(message)) return;
		if (
			previousState !== "awaiting_commit" &&
			previousState !== "awaiting_confirmation"
		) {
			return;
		}
		const documentAfter =
			pendingDocumentAfter || buildPendingDocumentAfter(content, message);
		const documentBefore = pendingDocumentBefore || content;
		await commitMutation.mutateAsync({
			project: activeProjectId,
			surface: "mission",
			dialogueId,
			notes: message,
			...(documentAfter && documentAfter !== content
				? {
						documentPath: missionPath,
						documentBefore,
						documentAfter,
					}
				: {}),
		});
		setPendingDocumentBefore(null);
		setPendingDocumentAfter(null);
		await refreshMissionQueries();
	}

	async function handleSubmit() {
		const message = inputValue.trim();
		if (!message) return;
		setInputValue("");
		const pendingAfter = buildPendingDocumentAfter(content, message);
		if (pendingAfter && pendingAfter !== content) {
			setPendingDocumentBefore(content);
			setPendingDocumentAfter(pendingAfter);
		}

		if (!activeDialogueId) {
			const result = await startTurnMutation.mutateAsync({
				project: activeProjectId,
				surface: "mission",
				title: "Mission dialogue",
				message,
			});
			setLocalDialogueId(result.dialogue.id);
			await navigate({
				to: "/factory/mission",
				search: { dialogueId: result.dialogue.id },
				replace: true,
			});
			await refreshMissionQueries();
			return;
		}

		const previousState = dialogueQuery.data?.dialogue.state;
		const result = await continueTurnMutation.mutateAsync({
			project: activeProjectId,
			surface: "mission",
			dialogueId: activeDialogueId,
			message,
		});
		await refreshMissionQueries();
		await maybeCommitAfterConcreteApproval(result.dialogue.id, message, previousState);
	}

	const readPane = documentQuery.isLoading ? (
		<div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
			Loading {missionPath}...
		</div>
	) : documentQuery.isError ? (
		<div className="rounded-md border border-destructive/40 p-6 text-sm">
			<div className="font-medium text-destructive">Could not load Mission</div>
			<p className="mt-2 text-muted-foreground">
				The cockpit expected <code>{missionPath}</code> for the active project.
			</p>
			<p className="mt-3 font-mono text-xs text-muted-foreground">
				{documentQuery.error.message}
			</p>
		</div>
	) : !content ? (
		<EmptyFactoryState
			title="Mission source is empty"
			body="The Mission view is wired to the active project's foundations/mission.md. DOMAIN_KNOWLEDGE_STEWARD intake will populate placeholder sections."
		/>
	) : (
		<div className="space-y-4">
			<div className="border-b pb-4">
				<p className="font-mono text-xs text-muted-foreground">
					{documentQuery.data?.source_relative_path || missionPath}
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
		<LDPSurface
			title="Mission"
			description="Project mission, identity, v0 demo line, decision filter, and operating principles with the full Living Document Pattern loop."
			status={{
				kind: "document",
				label: "Mission",
				state: dialogueStateForStatus(dialogueQuery.data?.dialogue.state),
				sourcePath: documentQuery.data?.source_relative_path || missionPath,
				lastUpdated: formatDate(documentQuery.data?.modified_at),
				primaryAgent: MISSION_AGENT.roleId,
				metrics: [
					{ label: "Sections", value: countSections(content) },
					{
						label: "TKTK placeholders",
						value: countTktk(content),
						tone: countTktk(content) > 0 ? "warning" : "success",
					},
					{
						label: "Dialogue turns",
						value: turns.length,
					},
					{
						label: "Active project",
						value: activeProjectId,
					},
				],
				flags: [
					{ label: "DOMAIN_KNOWLEDGE_STEWARD primary", tone: "success" },
					{ label: "STRATEGY_STEWARD impact", tone: "default" },
					pendingDocumentAfter
						? { label: "Pending write preview", tone: "warning" }
						: { label: "No pending write", tone: "default" },
				],
			}}
			primaryAgent={MISSION_AGENT}
			turns={turns}
			readPane={readPane}
			inputValue={inputValue}
			inputPlaceholder="Ask about the mission, propose a change, or approve a clear proposal..."
			isThinking={
				startTurnMutation.isPending ||
				continueTurnMutation.isPending ||
				commitMutation.isPending
			}
			cascadeDrafts={cascadeDrafts}
			onInputChange={setInputValue}
			onSubmit={handleSubmit}
		/>
	);
}
