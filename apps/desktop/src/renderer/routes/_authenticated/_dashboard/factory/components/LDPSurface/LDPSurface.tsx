import { FactoryPage } from "../FactoryView";
import { LDPCascadePanel } from "../LDPCascadePanel";
import { LDPChatPane } from "../LDPChatPane";
import { LDPStatusHeader } from "../LDPStatusHeader";
import { AlertTriangle } from "lucide-react";
import type { LDPSurfaceProps, LDPStaleStateNotice } from "./types";

function StaleStateNotice({ notice }: { notice: LDPStaleStateNotice }) {
	return (
		<div className="rounded-md border border-[color:var(--warning-light)] bg-[color:var(--warning-light)]/10 p-3 text-sm">
			<div className="flex items-start gap-2">
				<AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--warning-light)] dark:text-[var(--warning-dark)]" />
				<div className="space-y-1">
					<div className="font-medium">Review the latest foundation before approving</div>
					<p className="text-muted-foreground">{notice.changeSummary}</p>
					<div className="flex flex-wrap gap-2 font-mono text-xs text-muted-foreground">
						<span>{notice.surface}</span>
						<span>Last seen {notice.lastSeenAt}</span>
						{notice.changedAt && <span>Changed {notice.changedAt}</span>}
					</div>
				</div>
			</div>
		</div>
	);
}

export function LDPSurface({
	title,
	description,
	status,
	primaryAgent,
	turns,
	readPane,
	visualDiffPane,
	staleStateNotice,
	inputValue,
	inputPlaceholder,
	isThinking,
	thinkingLabel,
	cascadeDrafts = [],
	onInputChange,
	onSubmit,
}: LDPSurfaceProps) {
	return (
		<FactoryPage title={title} description={description}>
			<div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_26rem] overflow-hidden">
				<main className="min-w-0 overflow-y-auto border-r">
					<div className="border-b p-4">
						<LDPStatusHeader summary={status} />
					</div>
					<div className="space-y-4 px-8 py-6">
						{staleStateNotice && <StaleStateNotice notice={staleStateNotice} />}
						{visualDiffPane}
						{readPane}
					</div>
				</main>
				<aside className="flex min-h-0 flex-col">
					<LDPChatPane
						agent={primaryAgent}
						turns={turns}
						value={inputValue}
						placeholder={inputPlaceholder}
						isThinking={isThinking}
						thinkingLabel={thinkingLabel}
						onChange={onInputChange}
						onSubmit={onSubmit}
					/>
					{cascadeDrafts.length > 0 && (
						<div className="border-t">
							<LDPCascadePanel drafts={cascadeDrafts} />
						</div>
					)}
				</aside>
			</div>
		</FactoryPage>
	);
}
