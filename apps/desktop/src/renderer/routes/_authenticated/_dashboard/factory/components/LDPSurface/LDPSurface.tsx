import { FactoryPage } from "../FactoryView";
import { LDPCascadePanel } from "../LDPCascadePanel";
import { LDPChatPane } from "../LDPChatPane";
import { LDPStatusHeader } from "../LDPStatusHeader";
import type { LDPSurfaceProps } from "./types";

export function LDPSurface({
	title,
	description,
	status,
	primaryAgent,
	turns,
	readPane,
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
					<div className="px-8 py-6">{readPane}</div>
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
