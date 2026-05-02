import { Button } from "@superset/ui/button";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FolderOpen, Play, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "@superset/ui/sonner";
import { electronTrpc } from "renderer/lib/electron-trpc";

import { EmptyFactoryState, FactorySection } from "../../components/FactoryView";
import {
	IntakeOutputTabs,
	type IntakeOutputDocument,
	type IntakeTabKey,
} from "../../components/IntakeOutputTabs";
import type { IntakePropagationTarget } from "../../components/IntakePropagationPlan";
import { buildIntakeStatusSummary } from "../../components/IntakeStatusHeader";
import {
	LDPSurface,
	type LDPDialogueAgent,
	type LDPDialogueTurn,
} from "../../components/LDPSurface";

type IntakeStatus =
	| "pending"
	| "digesting"
	| "digested"
	| "propagated"
	| "shelved"
	| "declined";

interface IntakeDialogueMessage {
	id: string;
	speaker: "operator" | "agent" | "system";
	role_id?: string;
	content: string;
	created_at: string;
}

interface IntakeBundle {
	item: {
		id: string;
		project_id: string;
		type: string;
		title: string;
		slug: string;
		status: IntakeStatus;
		folder_relative_path: string;
		ingested_at?: string;
		last_activity_at?: string;
		propagation_target_count: number;
	};
	raw_input: string;
	summary?: string;
	outputs: IntakeOutputDocument[];
	propagation_targets: IntakePropagationTarget[];
	dialogue: IntakeDialogueMessage[];
}

type IntakeStreamEvent =
	| { type: "status"; message?: string }
	| { type: "chunk"; chunk?: string }
	| { type: "complete"; message?: string; bundle?: IntakeBundle }
	| { type: "error"; error?: string };

const INTAKE_AGENT: LDPDialogueAgent = {
	name: "INTAKE_STEWARD",
	roleId: "INTAKE_STEWARD",
	description: "Primary Layer 2 intake steward.",
};

const VALID_TABS: IntakeTabKey[] = [
	"SUMMARY",
	"01-key-insights",
	"02-confirmed-facts",
	"03-open-questions",
	"04-product-implications",
	"05-domain-knowledge",
	"06-strategy-signals",
	"07-lessons-candidates",
	"08-propagation-targets",
	"PLAN",
];

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/intake/$intakeId/",
)({
	validateSearch: (search) => ({
		tab:
			typeof search.tab === "string" && VALID_TABS.includes(search.tab as IntakeTabKey)
				? (search.tab as IntakeTabKey)
				: "SUMMARY",
		dialogueId:
			typeof search.dialogueId === "string" ? search.dialogueId : undefined,
		planTarget:
			typeof search.planTarget === "string" ? search.planTarget : undefined,
	}),
	component: IntakeDetailPage,
});

function mapTurn(message: IntakeDialogueMessage): LDPDialogueTurn {
	return {
		id: message.id,
		kind: message.speaker === "operator" ? "operator" : message.speaker,
		speaker: message.speaker,
		roleId: message.role_id,
		content: message.content,
		timestamp: message.created_at,
	};
}

function initialClassificationTurn(bundle: IntakeBundle): LDPDialogueTurn | undefined {
	if (bundle.dialogue.length > 0 || bundle.item.status !== "pending") {
		return undefined;
	}

	return {
		id: "classification-proposal",
		kind: "agent",
		speaker: "INTAKE_STEWARD",
		roleId: "INTAKE_STEWARD",
		content: `I think this is a ${bundle.item.type} for ${bundle.item.project_id}, saving as ${bundle.item.slug}. Confirm or correct?`,
	};
}

function isAmbiguousPropagationIntent(message: string) {
	return /\b(looks good|do it|go ahead|sounds good|approved?|ship it)\b/i.test(message);
}

function IntakeDialogueSubscription({
	intakeId,
	message,
	onEvent,
	onDone,
}: {
	intakeId: string;
	message: string;
	onEvent: (event: IntakeStreamEvent) => void;
	onDone: () => void;
}) {
	electronTrpc.factory.intake.submitDialogueTurn.useSubscription(
		{ intake_id: intakeId, message },
		{
			onData: (event) => onEvent(event as IntakeStreamEvent),
			onError: (error) => {
				onEvent({ type: "error", error: error.message });
				onDone();
			},
			onComplete: onDone,
		},
	);
	return null;
}

function IntakeDigestSubscription({
	intakeId,
	onEvent,
	onDone,
}: {
	intakeId: string;
	onEvent: (event: IntakeStreamEvent) => void;
	onDone: () => void;
}) {
	electronTrpc.factory.intake.runDigest.useSubscription(
		{ intake_id: intakeId },
		{
			onData: (event) => onEvent(event as IntakeStreamEvent),
			onError: (error) => {
				onEvent({ type: "error", error: error.message });
				onDone();
			},
			onComplete: onDone,
		},
	);
	return null;
}

function IntakeDetailPage() {
	const { intakeId } = Route.useParams();
	const decodedIntakeId = decodeURIComponent(intakeId);
	const search = Route.useSearch();
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();
	const [inputValue, setInputValue] = useState("");
	const [showRawInput, setShowRawInput] = useState(false);
	const [pendingTurn, setPendingTurn] = useState<string | null>(null);
	const [digestRunKey, setDigestRunKey] = useState<string | null>(null);
	const [streamingTurn, setStreamingTurn] = useState<LDPDialogueTurn | null>(null);
	const [localTurns, setLocalTurns] = useState<LDPDialogueTurn[]>([]);
	const [thinkingLabel, setThinkingLabel] = useState<string | undefined>();
	const intakeQuery = electronTrpc.factory.intake.get.useQuery(
		{ intake_id: decodedIntakeId },
		{ refetchInterval: 5000 },
	);

	const bundle = intakeQuery.data as IntakeBundle | undefined;
	const persistedTurns = useMemo(
		() => (bundle?.dialogue || []).map(mapTurn),
		[bundle?.dialogue],
	);
	const initialTurn = bundle ? initialClassificationTurn(bundle) : undefined;
	const turns = useMemo(
		() => [
			...(initialTurn ? [initialTurn] : []),
			...persistedTurns,
			...localTurns,
			...(streamingTurn ? [streamingTurn] : []),
		],
		[initialTurn, localTurns, persistedTurns, streamingTurn],
	);
	const operatorTurnCount = (bundle?.dialogue || []).filter(
		(message) => message.speaker === "operator",
	).length;
	const canApprove =
		bundle?.item.status === "digested" && operatorTurnCount > 0 && !pendingTurn;
	const status = bundle
		? buildIntakeStatusSummary({
				item: bundle.item,
				outputs: bundle.outputs,
				dialogueState: pendingTurn || digestRunKey ? "agent_thinking" : "idle",
			})
		: undefined;

	const updateSearch = (next: Partial<typeof search>) =>
		navigate({
			to: "/factory/intake/$intakeId",
			params: { intakeId },
			search: { ...search, ...next },
			replace: true,
		});

	const handleStreamEvent = (event: IntakeStreamEvent) => {
		if (event.type === "status") {
			setThinkingLabel(event.message || "INTAKE_STEWARD is thinking...");
			return;
		}
		if (event.type === "chunk" && event.chunk) {
			setThinkingLabel(undefined);
			setStreamingTurn((current) => ({
				id: current?.id || `stream-${Date.now()}`,
				kind: "agent",
				speaker: "INTAKE_STEWARD",
				roleId: "INTAKE_STEWARD",
				content: `${current?.content || ""}${event.chunk}`,
				timestamp: new Date().toISOString(),
			}));
			return;
		}
		if (event.type === "error") {
			setThinkingLabel(undefined);
			toast.error(event.error || "INTAKE_STEWARD turn failed");
		}
	};

	const finishStreaming = async () => {
		setPendingTurn(null);
		setDigestRunKey(null);
		setThinkingLabel(undefined);
		setStreamingTurn(null);
		await utils.factory.intake.get.invalidate({ intake_id: decodedIntakeId });
		await utils.factory.intake.list.invalidate();
	};

	const submit = () => {
		const message = inputValue.trim();
		if (!message || pendingTurn || digestRunKey || !bundle) return;
		if (canApprove && isAmbiguousPropagationIntent(message)) {
			setLocalTurns((current) => [
				...current,
				{
					id: `restate-${Date.now()}`,
					kind: "agent",
					speaker: "INTAKE_STEWARD",
					roleId: "INTAKE_STEWARD",
					content: `Just to be explicit: propagate all ${bundle.propagation_targets.length} plan targets exactly as currently shown? Reply with a concrete approval after reviewing the Plan tab.`,
					timestamp: new Date().toISOString(),
				},
			]);
			setInputValue("");
			return;
		}
		setPendingTurn(message);
		setInputValue("");
		setThinkingLabel("INTAKE_STEWARD is thinking...");
	};

	if (intakeQuery.isLoading) {
		return (
			<LDPSurface
				title="Intake"
				description="Loading intake."
				status={{
					kind: "composite",
					label: "Layer 2 intake",
					state: "idle",
					primaryAgent: INTAKE_AGENT.roleId,
					metrics: [],
				}}
				primaryAgent={INTAKE_AGENT}
				turns={[]}
				readPane={<EmptyFactoryState title="Loading intake" body={decodedIntakeId} />}
				inputValue=""
				onInputChange={() => undefined}
				onSubmit={() => undefined}
			/>
		);
	}

	if (intakeQuery.isError || !bundle || !status) {
		return (
			<LDPSurface
				title="Intake not available"
				description="The cockpit could not load this intake."
				status={{
					kind: "composite",
					label: "Layer 2 intake",
					state: "idle",
					primaryAgent: INTAKE_AGENT.roleId,
					metrics: [],
				}}
				primaryAgent={INTAKE_AGENT}
				turns={[]}
				readPane={
					<EmptyFactoryState
						title="Could not load intake"
						body={intakeQuery.error?.message || decodedIntakeId}
					/>
				}
				inputValue=""
				onInputChange={() => undefined}
				onSubmit={() => undefined}
			/>
		);
	}

	const readPane = (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center gap-2">
				<Button
					size="sm"
					variant="outline"
					onClick={() =>
						toast.info(`Open this folder in Explorer: ${bundle.item.folder_relative_path}`)
					}
				>
					<FolderOpen className="size-4" />
					Open intake folder
				</Button>
				<Button
					size="sm"
					variant="outline"
					onClick={() => setShowRawInput((value) => !value)}
				>
					Show raw input
				</Button>
				{bundle.item.status === "pending" && (
					<Button
						size="sm"
						onClick={() => {
							setDigestRunKey(`${Date.now()}`);
							setThinkingLabel("INTAKE_STEWARD digest is running...");
						}}
					>
						<Play className="size-4" />
						Run digest now
					</Button>
				)}
				<Button
					size="sm"
					disabled={!canApprove}
					onClick={() =>
						toast.info("Propagation diff preview and atomic commit ship in WO-C21.6.")
					}
				>
					<Send className="size-4" />
					Approve and propagate
				</Button>
			</div>

			{showRawInput && (
				<FactorySection title="Raw input" description={bundle.item.folder_relative_path}>
					<pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-xs">
						{bundle.raw_input}
					</pre>
				</FactorySection>
			)}

			<IntakeOutputTabs
				activeTab={search.tab}
				summary={bundle.summary}
				outputs={bundle.outputs}
				propagationTargets={bundle.propagation_targets}
				highlightedTarget={search.planTarget}
				onTabChange={(tab) => updateSearch({ tab })}
				onHighlightTarget={(target) => updateSearch({ planTarget: target, tab: "PLAN" })}
			/>
		</div>
	);

	return (
		<>
			<LDPSurface
				title={bundle.item.title}
				description="Layer 2 intake surface for digest review, INTAKE_STEWARD dialogue, and propagation readiness."
				status={status}
				primaryAgent={INTAKE_AGENT}
				turns={turns}
				readPane={readPane}
				inputValue={inputValue}
				inputPlaceholder="Ask INTAKE_STEWARD what matters, what should change, or how this should propagate..."
				isThinking={Boolean(pendingTurn || digestRunKey || thinkingLabel)}
				thinkingLabel={thinkingLabel}
				onInputChange={setInputValue}
				onSubmit={submit}
			/>
			{pendingTurn && (
				<IntakeDialogueSubscription
					intakeId={decodedIntakeId}
					message={pendingTurn}
					onEvent={handleStreamEvent}
					onDone={finishStreaming}
				/>
			)}
			{digestRunKey && (
				<IntakeDigestSubscription
					key={digestRunKey}
					intakeId={decodedIntakeId}
					onEvent={handleStreamEvent}
					onDone={finishStreaming}
				/>
			)}
		</>
	);
}
