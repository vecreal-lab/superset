import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";

import { EmptyFactoryState, FactorySection } from "../FactoryView";

export interface IntakePropagationTarget {
	path: string;
	reason?: string;
	status?: "candidate" | "staged" | "applied" | "blocked";
	content?: string;
}

interface IntakePropagationPlanProps {
	targets: IntakePropagationTarget[];
	highlightedTarget?: string;
	onHighlightTarget: (target: string | undefined) => void;
}

const GROUPS = [
	{
		id: "domain-knowledge",
		label: "Domain knowledge writes",
		matches: (path: string) => path.includes("/domain-knowledge/"),
	},
	{
		id: "drafts",
		label: "Draft writes",
		matches: (path: string) => path.includes("/drafts/"),
	},
	{
		id: "strategy-ledger",
		label: "Strategy ledger candidates",
		matches: (path: string) => path.includes("strategy"),
	},
	{
		id: "lessons",
		label: "Lesson candidates",
		matches: (path: string) => path.includes("lesson"),
	},
	{
		id: "other",
		label: "Other planned writes",
		matches: () => true,
	},
];

function actionForPath(path: string) {
	if (path.endsWith(".md")) return "append/update";
	if (path.endsWith(".yml") || path.endsWith(".yaml")) return "update";
	return "create/update";
}

function groupTargets(targets: IntakePropagationTarget[]) {
	const remaining = [...targets];
	return GROUPS.map((group) => {
		const rows = remaining.filter((target) => group.matches(target.path));
		for (const row of rows) {
			const index = remaining.indexOf(row);
			if (index >= 0) remaining.splice(index, 1);
		}
		return { ...group, rows };
	}).filter((group) => group.rows.length > 0);
}

export function IntakePropagationPlan({
	targets,
	highlightedTarget,
	onHighlightTarget,
}: IntakePropagationPlanProps) {
	if (targets.length === 0) {
		return (
			<EmptyFactoryState
				title="No propagation targets yet"
				body="Run the digest and continue the INTAKE_STEWARD dialogue until the plan contains concrete target files."
			/>
		);
	}

	return (
		<div className="space-y-4">
			{groupTargets(targets).map((group) => (
				<FactorySection
					key={group.id}
					title={group.label}
					description="Target rows stay read-only until WO-C21.6 adds the propagation diff preview and atomic commit flow."
				>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Target path</TableHead>
								<TableHead>Action</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Preview</TableHead>
								<TableHead>Controls</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{group.rows.map((target) => {
								const isHighlighted = highlightedTarget === target.path;
								return (
									<TableRow
										key={target.path}
										className={isHighlighted ? "bg-accent/40" : undefined}
									>
										<TableCell className="max-w-sm font-mono text-xs">
											{target.path}
										</TableCell>
										<TableCell>{actionForPath(target.path)}</TableCell>
										<TableCell>
											<Badge variant="outline">{target.status || "planned"}</Badge>
										</TableCell>
										<TableCell className="max-w-md text-sm text-muted-foreground">
											{target.content?.slice(0, 180) ||
												target.reason ||
												"Preview lands in WO-C21.6 before commit."}
										</TableCell>
										<TableCell>
											<div className="flex flex-wrap gap-1">
												<Button
													size="xs"
													variant="outline"
													onClick={() =>
														onHighlightTarget(isHighlighted ? undefined : target.path)
													}
												>
													{isHighlighted ? "Clear" : "Focus"}
												</Button>
												<Button size="xs" variant="ghost" disabled>
													Decline
												</Button>
												<Button size="xs" variant="ghost" disabled>
													Edit area
												</Button>
												<Button size="xs" variant="ghost" disabled>
													Move
												</Button>
											</div>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</FactorySection>
			))}
		</div>
	);
}
