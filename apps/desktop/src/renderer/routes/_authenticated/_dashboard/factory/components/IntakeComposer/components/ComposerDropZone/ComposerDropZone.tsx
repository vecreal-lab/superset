import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { Upload } from "lucide-react";
import type { DragEvent, ReactNode } from "react";

interface ComposerDropZoneProps {
	isDragging: boolean;
	error?: string;
	children: ReactNode;
	onDragEnter: (event: DragEvent<HTMLDivElement>) => void;
	onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
	onDragOver: (event: DragEvent<HTMLDivElement>) => void;
	onDrop: (event: DragEvent<HTMLDivElement>) => void;
	onPickFiles: () => void;
}

export function ComposerDropZone({
	isDragging,
	error,
	children,
	onDragEnter,
	onDragLeave,
	onDragOver,
	onDrop,
	onPickFiles,
}: ComposerDropZoneProps) {
	return (
		<div
			className={cn(
				"relative rounded-md border border-dashed p-4 transition-colors",
				isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/30",
			)}
			onDragEnter={onDragEnter}
			onDragLeave={onDragLeave}
			onDragOver={onDragOver}
			onDrop={onDrop}
		>
			{isDragging && (
				<div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/80 text-sm font-medium">
					Drop files here
				</div>
			)}
			<div className="space-y-4">
				<div className="flex items-center justify-between gap-3">
					<div>
						<div className="text-sm font-medium">Files</div>
						<p className="text-xs text-muted-foreground">
							Drag files here or pick them. The cockpit stores path references only.
						</p>
					</div>
					<Button type="button" size="sm" variant="outline" onClick={onPickFiles}>
						<Upload className="size-4" />
						Pick files
					</Button>
				</div>
				{children}
				{error && <p className="text-xs text-destructive">{error}</p>}
			</div>
		</div>
	);
}
