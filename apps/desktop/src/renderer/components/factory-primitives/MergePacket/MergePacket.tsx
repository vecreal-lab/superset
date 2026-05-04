import { Archive, GitMerge, Trash2 } from "lucide-react";
import type { SynthesisPacket } from "lib/types/factory-operator-console";
import {
	PrimitiveButton,
	cardPaddingStyle,
	mutedTextStyle,
	stackStyle,
} from "../common";

export interface MergePacketProps {
	packet: SynthesisPacket;
	onMerge?: () => void;
	onDiscardBranch?: () => void;
	onArchiveAfterMerge?: () => void;
}

export function MergePacket({
	packet,
	onMerge,
	onDiscardBranch,
	onArchiveAfterMerge,
}: MergePacketProps) {
	return (
		<section
			className="factory-card"
			aria-label={`Merge packet for ${packet.workOrderId}`}
			style={{ ...cardPaddingStyle, ...stackStyle }}
		>
			<header>
				<strong>{packet.workOrderId} ready for merge</strong>
				<p style={{ margin: "var(--sp-2) 0 0", ...mutedTextStyle }}>
					{packet.summary}
				</p>
			</header>
			<div style={stackStyle}>
				<strong>Changed files</strong>
				{packet.filesChanged.map((file) => (
					<div
						key={file.path}
						style={{
							display: "grid",
							gridTemplateColumns: "1fr auto",
							gap: "var(--sp-5)",
							color: "var(--text-secondary)",
						}}
					>
						<span>{file.path}</span>
						<span style={mutedTextStyle}>
							+{file.additions} / -{file.deletions}
						</span>
					</div>
				))}
			</div>
			<div style={{ display: "flex", gap: "var(--sp-4)", flexWrap: "wrap" }}>
				<PrimitiveButton variant="secondary" icon={GitMerge} onClick={onMerge}>
					Merge
				</PrimitiveButton>
				<PrimitiveButton variant="ghost" icon={Archive} onClick={onArchiveAfterMerge}>
					Archive after merge
				</PrimitiveButton>
				<PrimitiveButton variant="ghost" icon={Trash2} onClick={onDiscardBranch}>
					Discard branch
				</PrimitiveButton>
			</div>
		</section>
	);
}
