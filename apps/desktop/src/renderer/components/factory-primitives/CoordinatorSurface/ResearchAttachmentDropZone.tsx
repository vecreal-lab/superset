import { Paperclip } from "lucide-react";
import type { ArtifactReference } from "lib/types/factory-operator-console";
import { PrimitiveIcon, mutedTextStyle, rowStyle, stackStyle } from "../common";
import { EntityMentionLink } from "../EntityMentionLink";

export interface ResearchAttachmentDropZoneProps {
	references?: ArtifactReference[];
	disabled?: boolean;
	onFilesSelected?: (files: File[]) => void;
	onReferenceActivate?: (reference: ArtifactReference) => void;
}

export function ResearchAttachmentDropZone({
	references = [],
	disabled,
	onFilesSelected,
	onReferenceActivate,
}: ResearchAttachmentDropZoneProps) {
	return (
		<label
			className="factory-card"
			style={{
				...stackStyle,
				padding: "var(--sp-5)",
				borderStyle: "dashed",
				cursor: disabled ? "not-allowed" : "pointer",
			}}
			onDragOver={(event) => {
				if (!disabled) event.preventDefault();
			}}
			onDrop={(event) => {
				if (disabled) return;
				event.preventDefault();
				onFilesSelected?.(Array.from(event.dataTransfer.files));
			}}
		>
			<span style={rowStyle}>
				<PrimitiveIcon icon={Paperclip} />
				<strong>Attach research material</strong>
			</span>
			<span style={mutedTextStyle}>
				Drop image, PDF, transcript, URL notes, or another project artifact here.
			</span>
			{references.length > 0 && (
				<span style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-3)" }}>
					{references.map((reference) => (
						<EntityMentionLink
							key={reference.referenceId}
							reference={reference}
							onActivate={onReferenceActivate}
						/>
					))}
				</span>
			)}
			<input
				type="file"
				multiple
				disabled={disabled}
				style={{ display: "none" }}
				onChange={(event) =>
					onFilesSelected?.(Array.from(event.currentTarget.files || []))
				}
			/>
		</label>
	);
}
