import { useState } from "react";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer/MarkdownRenderer";
import { LDPSurface } from "../LDPSurface";
import type {
	LDPCascadeDraft,
	LDPDialogueAgent,
	LDPDialogueTurn,
	LDPStatusSummary,
} from "../LDPSurface";

const primaryAgent: LDPDialogueAgent = {
	name: "DOMAIN_KNOWLEDGE_STEWARD",
	roleId: "DOMAIN_KNOWLEDGE_STEWARD",
	description:
		"Co-authors domain-grounded identity and explains downstream impact before any commit.",
};

const status: LDPStatusSummary = {
	kind: "document",
	label: "Mission stub",
	state: "in_dialogue",
	sourcePath: "docs/factory/mission.md",
	lastUpdated: "2026-05-01",
	primaryAgent: primaryAgent.roleId,
	metrics: [
		{ label: "Sections present", value: 5, tone: "success" },
		{ label: "TKTK placeholders", value: 3, tone: "warning" },
		{ label: "Cascade drafts", value: 2 },
		{ label: "Confidence", value: "demo" },
	],
	flags: [
		{ label: "Operating Principle #13 active", tone: "success" },
		{ label: "Synthetic data only" },
	],
};

const initialTurns: LDPDialogueTurn[] = [
	{
		id: "turn-1",
		kind: "operator",
		speaker: "Yuriy",
		content: "Should the Mission page say more about who this is for?",
		timestamp: "10:04 AM",
	},
	{
		id: "turn-2",
		kind: "agent",
		speaker: "DOMAIN_KNOWLEDGE_STEWARD",
		roleId: "DOMAIN_KNOWLEDGE_STEWARD",
		content:
			"Yes. I would keep the locked identity line, then clarify the general-contractor operator and the construction PM demo promise. Before commit, I would read identity, operating principles, and construction PM intake.",
		timestamp: "10:05 AM",
	},
	{
		id: "turn-3",
		kind: "specialist",
		speaker: "STRATEGY_STEWARD",
		roleId: "STRATEGY_STEWARD",
		content:
			"Impact note: tightening the Mission copy may affect the V0 demo line, Construction PM identity, and future brand positioning drafts.",
		timestamp: "10:06 AM",
	},
];

const cascadeDrafts: LDPCascadeDraft[] = [
	{
		id: "WO-DEMO-001",
		title: "Refresh Construction PM identity after Mission edit",
		status: "queued",
		href: "/factory/work-orders/WO-DEMO-001",
		summary: "Drafted because Mission identity changed the product framing.",
	},
	{
		id: "WO-DEMO-002",
		title: "Audit affected cockpit copy",
		status: "queued",
		href: "/factory/approvals",
		summary: "Drafted because visible cockpit copy cites the Mission surface.",
	},
];

export function LDPDemoHarness() {
	const [inputValue, setInputValue] = useState("");
	const [turns, setTurns] = useState(initialTurns);

	function handleSubmit() {
		const nextTurn: LDPDialogueTurn = {
			id: `turn-${turns.length + 1}`,
			kind: "operator",
			speaker: "Yuriy",
			content: inputValue,
			timestamp: "now",
		};
		setTurns([...turns, nextTurn]);
		setInputValue("");
	}

	return (
		<LDPSurface
			title="LDP Demo"
			description="Synthetic renderer harness for the Living Document Pattern shell. No backend calls are made from this page."
			status={status}
			primaryAgent={primaryAgent}
			turns={turns}
			inputValue={inputValue}
			inputPlaceholder="Try: explain downstream impact before editing the mission"
			cascadeDrafts={cascadeDrafts}
			onInputChange={setInputValue}
			onSubmit={handleSubmit}
			readPane={
				<MarkdownRenderer
					content={`# Mission\n\n## Identity\n\nVertical AI Intelligence Company for General Contractors\n\n## Mission\n\nTKTK -- DOMAIN_KNOWLEDGE_STEWARD intake will populate.\n\n## Decision Filter\n\nTKTK -- this demo read pane is synthetic.`}
					className="h-auto overflow-visible"
				/>
			}
		/>
	);
}
