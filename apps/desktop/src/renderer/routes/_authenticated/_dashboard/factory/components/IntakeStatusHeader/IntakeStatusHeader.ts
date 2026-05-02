import type { LDPStatusSummary } from "../LDPSurface";
import { formatDate } from "../FactoryView";

interface IntakeStatusItem {
	project_id: string;
	type: string;
	status: string;
	folder_relative_path: string;
	last_activity_at?: string;
	ingested_at?: string;
	propagation_target_count: number;
}

interface IntakeStatusHeaderInput {
	item: IntakeStatusItem;
	outputs: Array<{ key: string; content: string }>;
	dialogueState?: LDPStatusSummary["state"];
}

export function extractDomainAreaTags(outputs: Array<{ key: string; content: string }>) {
	const content = outputs
		.filter((output) =>
			["05-domain-knowledge", "06-strategy-signals"].includes(output.key),
		)
		.map((output) => output.content)
		.join("\n");
	const tags = new Set<string>();
	for (const match of content.matchAll(/\barea\s*:\s*([a-z0-9/_-]+)/gi)) {
		tags.add(match[1]);
	}
	for (const match of content.matchAll(/\[(?:area|domain):\s*([a-z0-9/_-]+)\]/gi)) {
		tags.add(match[1]);
	}
	return [...tags].slice(0, 8);
}

export function buildIntakeStatusSummary({
	item,
	outputs,
	dialogueState = "idle",
}: IntakeStatusHeaderInput): LDPStatusSummary {
	const areaTags = extractDomainAreaTags(outputs);
	return {
		kind: "composite",
		label: "Layer 2 intake",
		state: dialogueState,
		sourcePath: item.folder_relative_path,
		lastUpdated: formatDate(item.last_activity_at || item.ingested_at),
		primaryAgent: "INTAKE_STEWARD",
		metrics: [
			{ label: "Type", value: item.type },
			{ label: "Project", value: item.project_id },
			{ label: "Status", value: item.status },
			{ label: "Plan targets", value: item.propagation_target_count },
			{ label: "Area tags", value: areaTags.length },
		],
		flags: [
			...areaTags.map((tag) => ({ label: `area:${tag}` })),
			{
				label:
					item.status === "digested"
						? "ready for operator dialogue"
						: `status:${item.status}`,
				tone: item.status === "digested" ? "success" : "default",
			},
		],
	};
}
