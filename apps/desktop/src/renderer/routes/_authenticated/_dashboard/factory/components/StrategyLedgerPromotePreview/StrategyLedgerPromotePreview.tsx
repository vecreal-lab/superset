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
import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer/MarkdownRenderer";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { EmptyFactoryState, SourceButton } from "../FactoryView";
import type { StrategyLedgerCandidate } from "../StrategyCandidateList";

interface StrategyLedgerPromotePreviewProps {
	candidate: StrategyLedgerCandidate | null;
	open: boolean;
	lastOperatorMessage?: string;
	onOpenChange: (open: boolean) => void;
	onOpenSource: (path: string) => void;
	onPromoted: () => void;
}

export function StrategyLedgerPromotePreview({
	candidate,
	open,
	lastOperatorMessage,
	onOpenChange,
	onOpenSource,
	onPromoted,
}: StrategyLedgerPromotePreviewProps) {
	const utils = electronTrpc.useUtils();
	const [operatorReason, setOperatorReason] = useState("");
	const [explicitlyConfirmed, setExplicitlyConfirmed] = useState(false);
	const previewQuery =
		electronTrpc.factory.strategyPulse.promotionPreview.useQuery(
			{
				candidate_id: candidate?.id || "",
				last_operator_message: lastOperatorMessage,
			},
			{ enabled: open && !!candidate },
		);
	const promoteMutation =
		electronTrpc.factory.strategyPulse.promoteCandidate.useMutation();

	useEffect(() => {
		if (open) {
			setOperatorReason("");
			setExplicitlyConfirmed(false);
		}
	}, [open, candidate?.id]);

	const preview = previewQuery.data;

	const handlePromote = async () => {
		if (!candidate || !preview) return;
		if (preview.requires_explicit_confirmation && !explicitlyConfirmed) {
			toast.warning("Confirm the restate-and-ask banner before writing.");
			return;
		}
		try {
			await promoteMutation.mutateAsync({
				candidate_id: candidate.id,
				operator_reason: operatorReason,
				last_operator_message: lastOperatorMessage,
			});
			await utils.factory.strategyPulse.listLedgerCandidates.invalidate();
			toast.success("Strategy candidate promoted to ledger.");
			onPromoted();
			onOpenChange(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Strategy promotion failed.",
			);
		}
	};

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="flex w-[52rem] flex-col gap-0 p-0 sm:max-w-[52rem]">
				<SheetHeader className="border-b px-6 py-5">
					<SheetTitle>Promote strategy candidate</SheetTitle>
					<SheetDescription>
						Preview the Strategy Ledger entry before writing.
					</SheetDescription>
				</SheetHeader>
				<ScrollArea className="min-h-0 flex-1">
					<div className="space-y-5 p-6">
						{previewQuery.isLoading ? (
							<EmptyFactoryState
								title="Preparing ledger preview"
								body="Reading the candidate and building a Strategy Ledger entry."
							/>
						) : previewQuery.isError ? (
							<EmptyFactoryState
								title="Preview failed"
								body={previewQuery.error.message}
							/>
						) : !candidate || !preview ? (
							<EmptyFactoryState title="No candidate selected" body="" />
						) : (
							<>
								{preview.requires_explicit_confirmation && (
									<section className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4">
										<div className="text-sm font-medium">Restate-and-ask required</div>
										<p className="mt-1 text-sm text-muted-foreground">
											{preview.confirmation_prompt ||
												"Confirm this ledger write explicitly before promotion."}
										</p>
										<Button
											className="mt-3"
											size="sm"
											variant={explicitlyConfirmed ? "secondary" : "outline"}
											onClick={() => setExplicitlyConfirmed(true)}
										>
											<CheckCircle2 className="size-4" />
											Yes, write this ledger entry
										</Button>
									</section>
								)}

								<section className="rounded-md border p-4">
									<div className="text-sm font-medium">{candidate.finding}</div>
									<div className="mt-2 flex flex-wrap gap-2">
										<SourceButton
											path={candidate.candidate_relative_path}
											onOpen={onOpenSource}
										>
											Candidate JSON
										</SourceButton>
										<SourceButton path={preview.ledger_path} onOpen={onOpenSource}>
											Target ledger
										</SourceButton>
									</div>
								</section>

								<section className="rounded-md border p-4">
									<div className="mb-3 text-sm font-medium">Proposed entry</div>
									<MarkdownRenderer
										content={preview.entry_markdown}
										className="h-auto overflow-visible"
									/>
								</section>

								<div className="space-y-2">
									<label className="text-sm font-medium" htmlFor="promotion-reason">
										Operator reason
									</label>
									<Textarea
										id="promotion-reason"
										value={operatorReason}
										placeholder="Optional free-form rationale for the promotion audit trail."
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
						disabled={promoteMutation.isPending}
					>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={handlePromote}
						disabled={
							!preview ||
							promoteMutation.isPending ||
							(preview.requires_explicit_confirmation && !explicitlyConfirmed)
						}
					>
						Promote to ledger
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
