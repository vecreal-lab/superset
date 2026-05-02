import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Textarea } from "@superset/ui/textarea";
import { toast } from "@superset/ui/sonner";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Play, RotateCw } from "lucide-react";
import { useMemo, useState } from "react";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer/MarkdownRenderer";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	EmptyFactoryState,
	FactorySection,
	formatDate,
} from "../../../../components/FactoryView";
import {
	LDPSurface,
	type LDPDialogueTurn,
	type LDPStatusSummary,
} from "../../../../components/LDPSurface";
import { LDPVisualDiff } from "../../../../components/LDPVisualDiff";

interface DomainKnowledgeDoc {
	id: string;
	title: string;
	file_name: string;
	relative_path: string;
	content: string;
	exists: boolean;
	modified_at?: string;
}

interface DomainKnowledgeSnippet {
	id: string;
	file_name: string;
	relative_path: string;
	content: string;
	body: string;
	curated: boolean;
	curated_into?: string;
	curated_at?: string;
	modified_at?: string;
}

interface DomainKnowledgeAreaDetail {
	project_id: string;
	area: string;
	label: string;
	area_relative_path: string;
	state_relative_path: string;
	last_curated_at?: string;
	total_snippets: number;
	uncurated_snippets: number;
	snippets_since_last_curation: number;
	structured_doc_count: number;
	needs_curation: boolean;
	trigger_reasons: string[];
	next_review_due?: string;
	docs: DomainKnowledgeDoc[];
	snippets: DomainKnowledgeSnippet[];
	policy_path: string;
	prompt_path: string;
}

interface DomainKnowledgeCurationTarget {
	path: string;
	action: "create" | "update";
	before_content: string;
	after_content: string;
	summary: string;
}

interface DomainKnowledgeCurationDraft {
	id: string;
	project_id: string;
	area: string;
	created_at: string;
	trigger: string;
	summary: string;
	source_snippets: string[];
	targets: DomainKnowledgeCurationTarget[];
	state_path: string;
	draft_relative_path: string;
}

type DomainKnowledgeStreamEvent =
	| { type: "status"; message: string }
	| { type: "chunk"; chunk: string }
	| { type: "complete"; message: string }
	| { type: "error"; error: string };

const DOMAIN_AGENT = {
	name: "DOMAIN_KNOWLEDGE_STEWARD",
	roleId: "DOMAIN_KNOWLEDGE_STEWARD",
	description:
		"Curates intake snippets into project-local domain knowledge without touching foundations.",
};

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/foundations/$projectId/domain-knowledge/$area/",
)({
	component: DomainKnowledgeAreaPage,
});

const decodeRouteParam = (value: string) => decodeURIComponent(value);

function stateFor(detail: DomainKnowledgeAreaDetail | undefined): LDPStatusSummary["state"] {
	if (!detail) return "idle";
	return detail.needs_curation ? "awaiting_commit" : "idle_exploratory";
}

function triggerText(reasons: string[]) {
	return reasons.length ? reasons.map((reason) => reason.replace(/_/g, " ")).join(", ") : "none";
}

function DomainKnowledgeDialogueSubscription({
	projectId,
	area,
	message,
	onEvent,
	onDone,
}: {
	projectId: string;
	area: string;
	message: string;
	onEvent: (event: DomainKnowledgeStreamEvent) => void;
	onDone: () => void;
}) {
	electronTrpc.factory.domainKnowledge.submitDialogueTurn.useSubscription(
		{ project_id: projectId, area, message },
		{
			onData: (event) => onEvent(event as DomainKnowledgeStreamEvent),
			onError: (error) => {
				onEvent({ type: "error", error: error.message });
				onDone();
			},
			onComplete: onDone,
		},
	);
	return null;
}

function DomainKnowledgeAreaPage() {
	const { projectId, area } = Route.useParams();
	const decodedProjectId = decodeRouteParam(projectId);
	const decodedArea = decodeRouteParam(area);
	const utils = electronTrpc.useUtils();
	const [inputValue, setInputValue] = useState("");
	const [pendingMessage, setPendingMessage] = useState<string | null>(null);
	const [thinkingLabel, setThinkingLabel] = useState<string | undefined>();
	const [streamingTurn, setStreamingTurn] = useState<LDPDialogueTurn | null>(null);
	const [turns, setTurns] = useState<LDPDialogueTurn[]>([]);
	const [draft, setDraft] = useState<DomainKnowledgeCurationDraft | null>(null);
	const [operatorReason, setOperatorReason] = useState("");
	const [editedTargets, setEditedTargets] = useState<Record<string, string>>({});
	const detailQuery = electronTrpc.factory.domainKnowledge.get.useQuery(
		{ project_id: decodedProjectId, area: decodedArea },
		{ refetchInterval: 5000 },
	);
	const runCurationMutation =
		electronTrpc.factory.domainKnowledge.runCuration.useMutation();
	const commitMutation =
		electronTrpc.factory.domainKnowledge.commitCuration.useMutation();

	const detail = detailQuery.data as DomainKnowledgeAreaDetail | undefined;
	const displayedTurns = useMemo(
		() => [...turns, ...(streamingTurn ? [streamingTurn] : [])],
		[streamingTurn, turns],
	);
	const uncuratedSnippets = detail?.snippets.filter((snippet) => !snippet.curated) || [];
	const cascadeDrafts = draft
		? [
				{
					id: draft.id,
					title: "Curation packet",
					href: draft.draft_relative_path,
					status: "preview",
					summary: "Review the visual diffs before committing domain knowledge.",
				},
			]
		: [];

	const refresh = async () => {
		await Promise.all([
			detailQuery.refetch(),
			utils.factory.domainKnowledge.list.invalidate(),
			utils.factory.domainKnowledge.get.invalidate(),
		]);
	};

	const runCuration = async () => {
		try {
			const result = (await runCurationMutation.mutateAsync({
				project_id: decodedProjectId,
				area: decodedArea,
				trigger: "operator_requested",
				operator_reason: operatorReason,
			})) as DomainKnowledgeCurationDraft;
			setDraft(result);
			setTurns((current) => [
				...current,
				{
					id: `curation-draft-${result.id}`,
					kind: "agent",
					speaker: "DOMAIN_KNOWLEDGE_STEWARD",
					roleId: "DOMAIN_KNOWLEDGE_STEWARD",
					content: `Prepared curation draft \`${result.id}\` with ${result.targets.length} write preview(s).`,
					timestamp: result.created_at,
				},
			]);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Curation failed.");
		}
	};

	const commitCuration = async () => {
		if (!draft) return;
		try {
			const result = await commitMutation.mutateAsync({
				project_id: decodedProjectId,
				area: decodedArea,
				curation_id: draft.id,
				operator_reason: operatorReason,
				edited_targets: Object.entries(editedTargets).map(([path, content]) => ({
					path,
					content,
				})),
			});
			setTurns((current) => [
				...current,
				{
					id: `curation-commit-${draft.id}`,
					kind: "system",
					speaker: "Cockpit",
					content: `Curation committed atomically. Receipt: \`${result.receipt_path}\`. Audit: \`${result.audit_path}\`.`,
					timestamp: new Date().toISOString(),
				},
			]);
			setDraft(null);
			setEditedTargets({});
			toast.success("Domain knowledge curation committed.");
			await refresh();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Commit failed.");
		}
	};

	const submitDialogue = () => {
		const message = inputValue.trim();
		if (!message || pendingMessage) return;
		setInputValue("");
		setPendingMessage(message);
		setThinkingLabel("DOMAIN_KNOWLEDGE_STEWARD is thinking...");
		setTurns((current) => [
			...current,
			{
				id: `operator-${Date.now()}`,
				kind: "operator",
				speaker: "Yuriy",
				content: message,
				timestamp: new Date().toISOString(),
			},
		]);
	};

	const handleDialogueEvent = (event: DomainKnowledgeStreamEvent) => {
		if (event.type === "status") {
			setThinkingLabel(event.message);
			return;
		}
		if (event.type === "chunk") {
			setThinkingLabel(undefined);
			setStreamingTurn((current) => ({
				id: current?.id || `domain-stream-${Date.now()}`,
				kind: "agent",
				speaker: "DOMAIN_KNOWLEDGE_STEWARD",
				roleId: "DOMAIN_KNOWLEDGE_STEWARD",
				content: `${current?.content || ""}${event.chunk}`,
				timestamp: new Date().toISOString(),
			}));
			return;
		}
		if (event.type === "error") {
			setThinkingLabel(undefined);
			setStreamingTurn(null);
			toast.error(event.error);
			return;
		}
	};

	const finishDialogue = () => {
		if (streamingTurn) {
			setTurns((current) => [...current, streamingTurn]);
		}
		setPendingMessage(null);
		setThinkingLabel(undefined);
		setStreamingTurn(null);
	};

	const readPane = detailQuery.isLoading ? (
		<div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
			Loading domain area...
		</div>
	) : detailQuery.isError || !detail ? (
		<EmptyFactoryState
			title="Domain area unavailable"
			body={detailQuery.error?.message || `${decodedProjectId}/${decodedArea}`}
		/>
	) : (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-4">
				<div>
					<div className="text-sm font-medium">{detail.label}</div>
					<div className="mt-1 font-mono text-xs text-muted-foreground">
						{detail.area_relative_path}
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button
						size="sm"
						variant="outline"
						disabled={detailQuery.isFetching}
						onClick={() => void refresh()}
					>
						<RotateCw className="size-4" />
						Refresh
					</Button>
					<Button
						size="sm"
						disabled={runCurationMutation.isPending || uncuratedSnippets.length === 0}
						onClick={() => void runCuration()}
					>
						<Play className="size-4" />
						Curate now
					</Button>
				</div>
			</div>

			<FactorySection
				title="Curation status"
				description="Cadence is based on uncurated snippet count and days since last curation."
			>
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					<Metric label="Last curated" value={formatDate(detail.last_curated_at)} />
					<Metric label="Uncurated snippets" value={detail.uncurated_snippets} />
					<Metric label="Trigger" value={triggerText(detail.trigger_reasons)} />
					<Metric label="State file" value={detail.state_relative_path} monospace />
				</div>
			</FactorySection>

			{draft && (
				<FactorySection
					title="Curation preview"
					description="Review every diff before committing. Edits here apply only to this curation draft."
				>
					<div className="space-y-4">
						<div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
							<div className="font-medium">Atomic commit pending</div>
							<p className="mt-1 text-muted-foreground">
								All doc updates, snippet frontmatter, state metadata, and audit entries
								write together or none write.
							</p>
						</div>
						{draft.targets.map((target) => (
							<div key={target.path} className="space-y-3 rounded-md border p-3">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<div>
										<Badge variant="outline">{target.action}</Badge>
										<p className="mt-2 font-mono text-xs">{target.path}</p>
										<p className="mt-1 text-sm text-muted-foreground">
											{target.summary}
										</p>
									</div>
								</div>
								<LDPVisualDiff
									before={target.before_content}
									after={editedTargets[target.path] ?? target.after_content}
									title="Structured doc diff"
									beforeLabel="Current"
									afterLabel="Curated draft"
								/>
								<Textarea
									value={editedTargets[target.path] ?? target.after_content}
									className="min-h-36 font-mono text-xs"
									onChange={(event) =>
										setEditedTargets((current) => ({
											...current,
											[target.path]: event.target.value,
										}))
									}
								/>
							</div>
						))}
						<div className="space-y-2">
							<label className="text-sm font-medium" htmlFor="curation-reason">
								Operator reason
							</label>
							<Textarea
								id="curation-reason"
								value={operatorReason}
								placeholder="Optional free-form note for the curation audit trail."
								onChange={(event) => setOperatorReason(event.target.value)}
							/>
						</div>
						<Button
							disabled={commitMutation.isPending}
							onClick={() => void commitCuration()}
						>
							<CheckCircle2 className="size-4" />
							Commit curation atomically
						</Button>
					</div>
				</FactorySection>
			)}

			<FactorySection title="Structured documents">
				<div className="space-y-4">
					{detail.docs.map((doc) => (
						<section key={doc.id} className="rounded-md border p-4">
							<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
								<div>
									<div className="font-medium">{doc.title}</div>
									<div className="font-mono text-xs text-muted-foreground">
										{doc.relative_path}
									</div>
								</div>
								<Badge variant={doc.exists ? "secondary" : "outline"}>
									{doc.exists ? "exists" : "missing"}
								</Badge>
							</div>
							{doc.content.trim() ? (
								<MarkdownRenderer
									content={doc.content}
									className="h-auto overflow-visible"
								/>
							) : (
								<p className="text-sm text-muted-foreground">
									No curated content yet.
								</p>
							)}
						</section>
					))}
				</div>
			</FactorySection>

			<FactorySection title="Intake snippets">
				{detail.snippets.length === 0 ? (
					<EmptyFactoryState
						title="No snippets yet"
						body="Intake propagation writes raw snippets here before curation."
					/>
				) : (
					<div className="space-y-3">
						{detail.snippets.map((snippet) => (
							<section key={snippet.relative_path} className="rounded-md border p-3">
								<div className="mb-2 flex flex-wrap items-center justify-between gap-2">
									<div className="font-mono text-xs">{snippet.relative_path}</div>
									<Badge variant={snippet.curated ? "secondary" : "outline"}>
										{snippet.curated ? "curated" : "uncurated"}
									</Badge>
								</div>
								<MarkdownRenderer
									content={snippet.body || snippet.content}
									className="h-auto max-h-60 overflow-auto"
								/>
								{snippet.curated_at && (
									<p className="mt-2 text-xs text-muted-foreground">
										Curated {formatDate(snippet.curated_at)} into{" "}
										{snippet.curated_into}
									</p>
								)}
							</section>
						))}
					</div>
				)}
			</FactorySection>
		</div>
	);

	return (
		<>
			<LDPSurface
				title={detail?.label || decodedArea}
				description="Domain knowledge curation hook for converting intake snippets into structured project memory."
				status={{
					kind: "read_model",
					label: "Domain knowledge area",
					state: pendingMessage ? "agent_thinking" : stateFor(detail),
					sourcePath: detail?.area_relative_path,
					lastUpdated: formatDate(detail?.last_curated_at),
					primaryAgent: DOMAIN_AGENT.roleId,
					metrics: [
						{ label: "Project", value: decodedProjectId },
						{ label: "Uncurated snippets", value: detail?.uncurated_snippets ?? 0 },
						{ label: "Structured docs", value: `${detail?.structured_doc_count ?? 0}/4` },
						{
							label: "Trigger",
							value: triggerText(detail?.trigger_reasons || []),
							tone: detail?.needs_curation ? "warning" : "success",
						},
					],
					flags: [
						{ label: "DOMAIN_KNOWLEDGE_STEWARD primary", tone: "success" },
						{ label: "Atomic commit", tone: "default" },
						{ label: "Snippets preserved", tone: "default" },
					],
				}}
				primaryAgent={DOMAIN_AGENT}
				turns={displayedTurns}
				readPane={readPane}
				inputValue={inputValue}
				inputPlaceholder="Ask what should be curated, whether this area is stale, or what the snippets imply..."
				isThinking={Boolean(pendingMessage || runCurationMutation.isPending || commitMutation.isPending)}
				thinkingLabel={
					commitMutation.isPending
						? "DOMAIN_KNOWLEDGE_STEWARD is committing atomically..."
						: runCurationMutation.isPending
							? "DOMAIN_KNOWLEDGE_STEWARD is drafting curation diffs..."
							: thinkingLabel
				}
				cascadeDrafts={cascadeDrafts}
				onInputChange={setInputValue}
				onSubmit={submitDialogue}
			/>
			{pendingMessage && (
				<DomainKnowledgeDialogueSubscription
					projectId={decodedProjectId}
					area={decodedArea}
					message={pendingMessage}
					onEvent={handleDialogueEvent}
					onDone={finishDialogue}
				/>
			)}
		</>
	);
}

function Metric({
	label,
	value,
	monospace = false,
}: {
	label: string;
	value: string | number;
	monospace?: boolean;
}) {
	return (
		<div className="rounded-md border bg-muted/20 px-3 py-2">
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className={monospace ? "mt-1 break-all font-mono text-xs" : "mt-1 text-sm font-medium"}>
				{value}
			</div>
		</div>
	);
}
