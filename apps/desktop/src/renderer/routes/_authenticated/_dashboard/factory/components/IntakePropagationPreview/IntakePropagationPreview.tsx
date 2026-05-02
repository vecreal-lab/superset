import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { ScrollArea } from "@superset/ui/scroll-area";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@superset/ui/sheet";
import { Textarea } from "@superset/ui/textarea";
import { toast } from "@superset/ui/sonner";
import { CheckCircle2, Pencil, RotateCcw, SkipForward } from "lucide-react";
import { useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { EmptyFactoryState, FactorySection } from "../FactoryView";
import { LDPVisualDiff } from "../LDPVisualDiff";

type PropagationTargetType =
	| "domain-knowledge"
	| "draft"
	| "strategy"
	| "lesson"
	| "other";

type PropagationAction = "create" | "append" | "update";

interface PropagationTargetPreview {
	path: string;
	type: PropagationTargetType;
	action: PropagationAction;
	before_content: string;
	after_content: string;
	summary: string;
	virtual: boolean;
}

interface PropagationCandidatePreview {
	id: string;
	kind: "strategy" | "lesson";
	title: string;
	body: string;
	status: string;
	source_intake: string;
}

interface PropagationPreview {
	intake_id: string;
	project_id: string;
	title: string;
	target_count: number;
	requires_explicit_confirmation: boolean;
	confirmation_prompt?: string;
	targets: PropagationTargetPreview[];
	strategy_candidates: PropagationCandidatePreview[];
	lesson_candidates: PropagationCandidatePreview[];
}

interface IntakePropagationPreviewProps {
	intakeId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCommitted: () => void;
}

const GROUPS: {
	id: PropagationTargetType;
	label: string;
	description: string;
}[] = [
	{
		id: "domain-knowledge",
		label: "Domain knowledge writes",
		description: "Intake snippets and any newly seeded domain areas.",
	},
	{
		id: "draft",
		label: "Draft writes",
		description: "Operator-reviewed draft notes and future product material.",
	},
	{
		id: "other",
		label: "Other writes",
		description: "Additional non-foundation artifacts from the propagation plan.",
	},
];

function groupTargets(preview?: PropagationPreview) {
	return GROUPS.map((group) => ({
		...group,
		targets: (preview?.targets || []).filter(
			(target) => target.type === group.id && !target.virtual,
		),
	})).filter((group) => group.targets.length > 0);
}

function labelForAction(action: PropagationAction) {
	if (action === "append") return "append";
	if (action === "update") return "update";
	return "create";
}

export function IntakePropagationPreview({
	intakeId,
	open,
	onOpenChange,
	onCommitted,
}: IntakePropagationPreviewProps) {
	const utils = electronTrpc.useUtils();
	const previewQuery = electronTrpc.factory.intake.previewPropagation.useQuery(
		{ intake_id: intakeId },
		{ enabled: open },
	);
	const commitMutation = electronTrpc.factory.intake.commitPropagation.useMutation();
	const [skippedPaths, setSkippedPaths] = useState<Set<string>>(() => new Set());
	const [editingPath, setEditingPath] = useState<string | null>(null);
	const [editedTargets, setEditedTargets] = useState<Record<string, string>>({});
	const [explicitlyConfirmed, setExplicitlyConfirmed] = useState(false);
	const [operatorReason, setOperatorReason] = useState("");

	const preview = previewQuery.data as PropagationPreview | undefined;
	const targetGroups = useMemo(() => groupTargets(preview), [preview]);

	const toggleSkipped = (path: string) => {
		setSkippedPaths((current) => {
			const next = new Set(current);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	};

	const effectiveAfter = (target: PropagationTargetPreview) =>
		editedTargets[target.path] ?? target.after_content;

	const handleCommit = async () => {
		if (!preview) return;
		if (preview.requires_explicit_confirmation && !explicitlyConfirmed) {
			toast.warning("Confirm the restate-and-ask banner before writing.");
			return;
		}
		try {
			await commitMutation.mutateAsync({
				intake_id: intakeId,
				operator_reason: operatorReason,
				skipped_paths: [...skippedPaths],
				edited_targets: Object.entries(editedTargets).map(([path, content]) => ({
					path,
					content,
				})),
			});
			await utils.factory.intake.get.invalidate({ intake_id: intakeId });
			await utils.factory.intake.list.invalidate();
			toast.success("Propagation committed atomically.");
			onCommitted();
			onOpenChange(false);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Propagation failed.");
		}
	};

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="flex w-[58rem] flex-col gap-0 p-0 sm:max-w-[58rem]">
				<SheetHeader className="border-b px-6 py-5">
					<SheetTitle>
						Approve propagation of {preview?.target_count ?? 0} targets
					</SheetTitle>
					<SheetDescription>
						Review every write before the intake touches the knowledge base.
					</SheetDescription>
				</SheetHeader>

				<ScrollArea className="min-h-0 flex-1">
					<div className="space-y-5 p-6">
						{previewQuery.isLoading ? (
							<EmptyFactoryState
								title="Preparing preview"
								body="Reading current targets and building diffs."
							/>
						) : previewQuery.isError ? (
							<EmptyFactoryState
								title="Preview failed"
								body={previewQuery.error.message}
							/>
						) : !preview ? (
							<EmptyFactoryState title="No preview" body={intakeId} />
						) : (
							<>
								{preview.requires_explicit_confirmation && (
									<section className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4">
										<div className="text-sm font-medium">Restate-and-ask required</div>
										<p className="mt-1 text-sm text-muted-foreground">
											{preview.confirmation_prompt ||
												"Confirm this propagation explicitly before writing."}
										</p>
										<Button
											className="mt-3"
											size="sm"
											variant={explicitlyConfirmed ? "secondary" : "outline"}
											onClick={() => setExplicitlyConfirmed(true)}
										>
											<CheckCircle2 className="size-4" />
											Yes, confirm this write
										</Button>
									</section>
								)}

								{targetGroups.length === 0 ? (
									<EmptyFactoryState
										title="No filesystem writes"
										body="This plan only contains virtual strategy or lesson candidates."
									/>
								) : (
									targetGroups.map((group) => (
										<FactorySection
											key={group.id}
											title={group.label}
											description={group.description}
										>
											<div className="space-y-4">
												{group.targets.map((target) => {
													const isSkipped = skippedPaths.has(target.path);
													const isEditing = editingPath === target.path;
													const after = effectiveAfter(target);
													return (
														<section
															key={target.path}
															className="space-y-3 rounded-md border p-3"
														>
															<div className="flex flex-wrap items-start justify-between gap-3">
																<div className="min-w-0">
																	<div className="flex flex-wrap items-center gap-2">
																		<Badge variant="outline">
																			{labelForAction(target.action)}
																		</Badge>
																		{isSkipped && (
																			<Badge variant="secondary">skipped</Badge>
																		)}
																	</div>
																	<p className="mt-2 break-all font-mono text-xs">
																		{target.path}
																	</p>
																	<p className="mt-1 text-sm text-muted-foreground">
																		{target.summary}
																	</p>
																</div>
																<div className="flex flex-wrap gap-2">
																	<Button
																		size="xs"
																		variant={isSkipped ? "secondary" : "outline"}
																		onClick={() => toggleSkipped(target.path)}
																	>
																		<SkipForward className="size-3.5" />
																		{isSkipped ? "Include" : "Skip"}
																	</Button>
																	<Button
																		size="xs"
																		variant="outline"
																		onClick={() =>
																			setEditingPath(isEditing ? null : target.path)
																		}
																	>
																		<Pencil className="size-3.5" />
																		{isEditing ? "Close edit" : "Edit"}
																	</Button>
																	{editedTargets[target.path] !== undefined && (
																		<Button
																			size="xs"
																			variant="ghost"
																			onClick={() =>
																				setEditedTargets((current) => {
																					const next = { ...current };
																					delete next[target.path];
																					return next;
																				})
																			}
																		>
																			<RotateCcw className="size-3.5" />
																			Reset
																		</Button>
																	)}
																</div>
															</div>

															{isEditing ? (
																<Textarea
																	value={after}
																	className="min-h-56 font-mono text-xs"
																	onChange={(event) =>
																		setEditedTargets((current) => ({
																			...current,
																			[target.path]: event.target.value,
																		}))
																	}
																/>
															) : (
																<LDPVisualDiff
																	before={target.before_content}
																	after={after}
																	title="Write preview"
																	beforeLabel="Current"
																	afterLabel={
																		target.action === "create"
																			? "Will create"
																			: "Will write"
																	}
																/>
															)}
														</section>
													);
												})}
											</div>
										</FactorySection>
									))
								)}

								<CandidateSection
									title="Strategy ledger candidates"
									candidates={preview.strategy_candidates}
								/>
								<CandidateSection
									title="Lesson candidates"
									candidates={preview.lesson_candidates}
								/>

								<div className="space-y-2">
									<label className="text-sm font-medium" htmlFor="propagation-reason">
										Operator reason
									</label>
									<Textarea
										id="propagation-reason"
										value={operatorReason}
										placeholder="Optional free-form note for the audit trail."
										onChange={(event) => setOperatorReason(event.target.value)}
									/>
								</div>
							</>
						)}
					</div>
				</ScrollArea>

				<SheetFooter className="border-t p-4">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={commitMutation.isPending}
					>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={handleCommit}
						disabled={
							!preview ||
							commitMutation.isPending ||
							(preview.requires_explicit_confirmation && !explicitlyConfirmed)
						}
					>
						Confirm and write
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

function CandidateSection({
	title,
	candidates,
}: {
	title: string;
	candidates: PropagationCandidatePreview[];
}) {
	if (!candidates.length) {
		return null;
	}
	return (
		<FactorySection
			title={title}
			description="Virtual candidates are recorded for downstream cockpit review."
		>
			<div className="space-y-2">
				{candidates.map((candidate) => (
					<div key={candidate.id} className="rounded-md border p-3">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div className="text-sm font-medium">{candidate.title}</div>
							<Badge variant="outline">{candidate.status}</Badge>
						</div>
						<p className="mt-2 text-sm text-muted-foreground">{candidate.body}</p>
						<p className="mt-2 font-mono text-xs text-muted-foreground">
							{candidate.source_intake}
						</p>
					</div>
				))}
			</div>
		</FactorySection>
	);
}
