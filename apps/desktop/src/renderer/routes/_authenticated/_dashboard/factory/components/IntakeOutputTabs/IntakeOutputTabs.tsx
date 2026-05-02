import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer/MarkdownRenderer";

import { EmptyFactoryState } from "../FactoryView";
import {
	IntakePropagationPlan,
	type IntakePropagationTarget,
} from "../IntakePropagationPlan";

export type IntakeTabKey =
	| "SUMMARY"
	| "01-key-insights"
	| "02-confirmed-facts"
	| "03-open-questions"
	| "04-product-implications"
	| "05-domain-knowledge"
	| "06-strategy-signals"
	| "07-lessons-candidates"
	| "08-propagation-targets"
	| "PLAN";

export interface IntakeOutputDocument {
	key: Exclude<IntakeTabKey, "SUMMARY" | "PLAN">;
	title: string;
	path: string;
	content: string;
}

interface IntakeOutputTabsProps {
	activeTab: IntakeTabKey;
	summary?: string;
	outputs: IntakeOutputDocument[];
	propagationTargets: IntakePropagationTarget[];
	onTabChange: (tab: IntakeTabKey) => void;
	highlightedTarget?: string;
	onHighlightTarget: (target: string | undefined) => void;
}

const TAB_LABELS: { key: IntakeTabKey; label: string }[] = [
	{ key: "SUMMARY", label: "SUMMARY" },
	{ key: "01-key-insights", label: "01 Insights" },
	{ key: "02-confirmed-facts", label: "02 Conflicts" },
	{ key: "03-open-questions", label: "03 Confirmations" },
	{ key: "04-product-implications", label: "04 New Ideas" },
	{ key: "05-domain-knowledge", label: "05 Quotables" },
	{ key: "06-strategy-signals", label: "06 Domain Knowledge" },
	{ key: "07-lessons-candidates", label: "07 Strategy Ledger" },
	{ key: "08-propagation-targets", label: "08 Lessons" },
	{ key: "PLAN", label: "Plan" },
];

function countMarkdownItems(content?: string) {
	if (!content) return 0;
	const bullets = content.match(/^\s*[-*]\s+/gm)?.length || 0;
	const headings = content.match(/^#{2,}\s+/gm)?.length || 0;
	return bullets || headings;
}

function outputFor(outputs: IntakeOutputDocument[], tab: IntakeTabKey) {
	if (tab === "SUMMARY" || tab === "PLAN") return undefined;
	return outputs.find((output) => output.key === tab);
}

export function IntakeOutputTabs({
	activeTab,
	summary,
	outputs,
	propagationTargets,
	onTabChange,
	highlightedTarget,
	onHighlightTarget,
}: IntakeOutputTabsProps) {
	const activeOutput = outputFor(outputs, activeTab);
	const activeContent = activeTab === "SUMMARY" ? summary : activeOutput?.content;

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap gap-2">
				{TAB_LABELS.map((tab) => {
					const output = outputFor(outputs, tab.key);
					const count =
						tab.key === "PLAN"
							? propagationTargets.length
							: tab.key === "SUMMARY"
								? countMarkdownItems(summary)
								: countMarkdownItems(output?.content);
					return (
						<Button
							key={tab.key}
							size="xs"
							variant={activeTab === tab.key ? "secondary" : "outline"}
							onClick={() => onTabChange(tab.key)}
						>
							{tab.label}
							{count > 0 && (
								<Badge variant="outline" className="ml-1 px-1 py-0 text-[10px]">
									{count}
								</Badge>
							)}
						</Button>
					);
				})}
			</div>

			{activeTab === "PLAN" ? (
				<IntakePropagationPlan
					targets={propagationTargets}
					highlightedTarget={highlightedTarget}
					onHighlightTarget={onHighlightTarget}
				/>
			) : activeContent?.trim() ? (
				<div className="rounded-md border p-4">
					{activeOutput && (
						<p className="mb-3 font-mono text-xs text-muted-foreground">
							{activeOutput.path}
						</p>
					)}
					<MarkdownRenderer content={activeContent} className="h-auto overflow-visible" />
				</div>
			) : (
				<EmptyFactoryState
					title="No output in this tab yet"
					body="Run the digest or continue the INTAKE_STEWARD dialogue to populate this intake output."
				/>
			)}
		</div>
	);
}
