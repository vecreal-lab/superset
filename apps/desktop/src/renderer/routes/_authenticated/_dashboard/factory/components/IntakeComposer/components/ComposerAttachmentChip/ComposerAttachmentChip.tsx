import { Button } from "@superset/ui/button";
import { X } from "lucide-react";

export interface ComposerAttachment {
	path: string;
	filename: string;
}

interface ComposerAttachmentChipProps {
	attachment: ComposerAttachment;
	onRemove: (path: string) => void;
}

export function ComposerAttachmentChip({
	attachment,
	onRemove,
}: ComposerAttachmentChipProps) {
	return (
		<div
			className="inline-flex max-w-full items-center gap-1 rounded-md border bg-muted/30 px-2 py-1 text-xs"
			title={`${attachment.path}\nRead at intake time from this path. No upload or copy is performed.`}
		>
			<span className="truncate">{attachment.filename}</span>
			<Button
				type="button"
				size="xs"
				variant="ghost"
				className="h-5 w-5 p-0"
				aria-label={`Remove ${attachment.filename}`}
				onClick={() => onRemove(attachment.path)}
			>
				<X className="size-3" />
			</Button>
		</div>
	);
}
