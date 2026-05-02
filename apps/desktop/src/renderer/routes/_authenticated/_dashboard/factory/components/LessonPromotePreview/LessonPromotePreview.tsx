import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
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
import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { MarkdownEditor } from "renderer/components/MarkdownEditor/MarkdownEditor";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer/MarkdownRenderer";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { EmptyFactoryState, SourceButton } from "../FactoryView";
import type { IntakeLessonCandidate } from "../IntakeLessonCandidateList";

interface LessonPromotePreviewProps {
	candidate: IntakeLessonCandidate | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onOpenSource: (path: string) => void;
	onPromoted: () => void;
}

export function LessonPromotePreview({
	candidate,
	open,
	onOpenChange,
	onOpenSource,
	onPromoted,
}: LessonPromotePreviewProps) {
	const utils = electronTrpc.useUtils();
	const [targetTier, setTargetTier] = useState<1 | 2 | 3>(2);
	const [targetRole, setTargetRole] = useState("INTAKE_STEWARD");
	const [targetProject, setTargetProject] = useState("software-factory");
	const [editedBody, setEditedBody] = useState("");
	const [operatorReason, setOperatorReason] = useState("");
	const [lastOperatorMessage, setLastOperatorMessage] = useState("");
	const [explicitlyConfirmed, setExplicitlyConfirmed] = useState(false);

	useEffect(() => {
		if (!open || !candidate) return;
		setTargetTier(candidate.recommended_tier || 2);
		setTargetRole(candidate.recommended_target_role || "INTAKE_STEWARD");
		setTargetProject(candidate.recommended_target_project || "software-factory");
		setEditedBody(candidate.body || "");
		setOperatorReason("");
		setLastOperatorMessage("");
		setExplicitlyConfirmed(false);
	}, [open, candidate]);

	const previewQuery = electronTrpc.factory.lessons.promotionPreview.useQuery(
		{
			candidate_id: candidate?.id || "",
			target_tier: targetTier,
			target_role: targetRole,
			target_project: targetProject,
			edited_body: editedBody,
			operator_reason: operatorReason,
			last_operator_message: lastOperatorMessage,
		},
		{ enabled: open && !!candidate },
	);
	const promoteMutation = electronTrpc.factory.lessons.promoteCandidate.useMutation();

	const preview = previewQuery.data;

	const handlePromote = async () => {
		if (!candidate || !preview) return;
		if (preview.requires_explicit_confirmation && !explicitlyConfirmed) {
			toast.warning("Confirm the restate-and-ask banner before writing.");
			return;
		}
		try {
			const result = await promoteMutation.mutateAsync({
				candidate_id: candidate.id,
				target_tier: targetTier,
				target_role: targetRole,
				target_project: targetProject,
				edited_body: editedBody,
				operator_reason: operatorReason,
				last_operator_message: lastOperatorMessage,
			});
			await utils.factory.lessons.listIntakeCandidates.invalidate();
			if (targetTier === 3 && result.audit_confirmed === false) {
				toast.warning("AUDIT rejected Tier 3 promotion.");
				return;
			}
			toast.success("Lesson candidate promoted.");
			onPromoted();
			onOpenChange(false);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Lesson promotion failed.");
		}
	};

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="flex w-[68rem] flex-col gap-0 p-0 sm:max-w-[68rem]">
				<SheetHeader className="border-b px-6 py-5">
					<SheetTitle>Review lesson candidate</SheetTitle>
					<SheetDescription>
						Edit the candidate body, choose a tier, and preview the target write.
					</SheetDescription>
				</SheetHeader>
				<ScrollArea className="min-h-0 flex-1">
					<div className="space-y-5 p-6">
						{!candidate ? (
							<EmptyFactoryState title="No candidate selected" body="" />
						) : (
							<>
								<div className="grid gap-4 lg:grid-cols-2">
									<section className="rounded-md border p-4">
										<div className="text-sm font-medium">Candidate</div>
										<div className="mt-2 flex flex-wrap gap-2">
											<SourceButton
												path={candidate.source_relative_path}
												onOpen={onOpenSource}
											>
												Candidate file
											</SourceButton>
											<SourceButton
												path={candidate.source_intake}
												onOpen={onOpenSource}
											>
												Source intake
											</SourceButton>
										</div>
										<div className="mt-4 max-h-80 overflow-y-auto rounded-md border bg-muted/20 p-3">
											<MarkdownRenderer
												content={candidate.body}
												className="h-auto overflow-visible"
											/>
										</div>
									</section>
									<section className="rounded-md border p-4">
										<div className="text-sm font-medium">Source intake summary</div>
										<div className="mt-4 max-h-80 overflow-y-auto rounded-md border bg-muted/20 p-3">
											<MarkdownRenderer
												content={candidate.source_intake_summary}
												className="h-auto overflow-visible"
											/>
										</div>
									</section>
								</div>

								<section className="space-y-4 rounded-md border p-4">
									<div className="text-sm font-medium">Promotion target</div>
									<div className="grid gap-3 lg:grid-cols-3">
										<label className="space-y-1 text-sm">
											<span className="text-xs text-muted-foreground">Tier</span>
											<select
												value={targetTier}
												className="h-9 w-full rounded-md border bg-background px-2 text-sm"
												onChange={(event) =>
													setTargetTier(Number(event.target.value) as 1 | 2 | 3)
												}
											>
												<option value={1}>Tier 1 — role</option>
												<option value={2}>Tier 2 — project</option>
												<option value={3}>Tier 3 — factory shared</option>
											</select>
										</label>
										<label className="space-y-1 text-sm">
											<span className="text-xs text-muted-foreground">Role</span>
											<Input
												value={targetRole}
												disabled={targetTier !== 1}
												onChange={(event) => setTargetRole(event.target.value)}
											/>
										</label>
										<label className="space-y-1 text-sm">
											<span className="text-xs text-muted-foreground">Project</span>
											<Input
												value={targetProject}
												disabled={targetTier !== 2}
												onChange={(event) => setTargetProject(event.target.value)}
											/>
										</label>
									</div>
									<div className="space-y-2">
										<label className="text-sm font-medium" htmlFor="operator-reason">
											Operator reason
										</label>
										<Textarea
											id="operator-reason"
											value={operatorReason}
											placeholder="Optional free-form note for the audit trail."
											onChange={(event) => setOperatorReason(event.target.value)}
										/>
									</div>
									<div className="space-y-2">
										<label className="text-sm font-medium" htmlFor="last-operator-message">
											Commit phrase
										</label>
										<Input
											id="last-operator-message"
											value={lastOperatorMessage}
											placeholder='Type "sounds good" to exercise restate-and-ask, or a concrete promotion reason.'
											onChange={(event) => {
												setLastOperatorMessage(event.target.value);
												setExplicitlyConfirmed(false);
											}}
										/>
									</div>
								</section>

								<section className="space-y-3 rounded-md border p-4">
									<div className="text-sm font-medium">Edit before promote</div>
									<MarkdownEditor
										content={editedBody}
										onChange={setEditedBody}
										placeholder="Edit the lesson candidate before promotion..."
										editorClassName="min-h-48"
									/>
								</section>

								{previewQuery.isLoading ? (
									<EmptyFactoryState
										title="Preparing promotion preview"
										body="Building the target lesson write."
									/>
								) : previewQuery.isError ? (
									<EmptyFactoryState
										title="Preview failed"
										body={previewQuery.error.message}
									/>
								) : preview ? (
									<section className="space-y-4 rounded-md border p-4">
										<div className="flex flex-wrap items-center justify-between gap-2">
											<div>
												<div className="text-sm font-medium">Proposed target</div>
												<p className="mt-1 break-all font-mono text-xs text-muted-foreground">
													{preview.target_path}
												</p>
											</div>
											{preview.audit_required && (
												<div className="rounded-md border border-amber-500/40 px-3 py-2 text-xs">
													Tier 3 requires AUDIT signoff
												</div>
											)}
										</div>
										{preview.requires_explicit_confirmation && (
											<div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4">
												<div className="text-sm font-medium">
													Restate-and-ask required
												</div>
												<p className="mt-1 text-sm text-muted-foreground">
													{preview.confirmation_prompt}
												</p>
												<Button
													className="mt-3"
													size="sm"
													variant={explicitlyConfirmed ? "secondary" : "outline"}
													onClick={() => setExplicitlyConfirmed(true)}
												>
													<CheckCircle2 className="size-4" />
													Yes, promote this lesson
												</Button>
											</div>
										)}
										<div className="max-h-96 overflow-y-auto rounded-md border bg-muted/20 p-3">
											<MarkdownRenderer
												content={preview.content}
												className="h-auto overflow-visible"
											/>
										</div>
									</section>
								) : null}
							</>
						)}
					</div>
				</ScrollArea>
				<SheetFooter className="border-t p-4">
					<Button
						type="button"
						variant="outline"
						disabled={promoteMutation.isPending}
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						type="button"
						disabled={
							!preview ||
							promoteMutation.isPending ||
							(preview.requires_explicit_confirmation && !explicitlyConfirmed)
						}
						onClick={handlePromote}
					>
						Promote
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
