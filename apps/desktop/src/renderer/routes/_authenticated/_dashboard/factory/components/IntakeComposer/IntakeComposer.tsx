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
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import {
	useRef,
	useState,
	type ChangeEvent,
	type DragEvent,
	type FormEvent,
} from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useActiveProjectId } from "renderer/stores/active-project";
import { FactoryTextarea } from "../FactoryView";
import {
	ComposerAttachmentChip,
	type ComposerAttachment,
} from "./components/ComposerAttachmentChip";
import { ComposerDropZone } from "./components/ComposerDropZone";

interface IntakeComposerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

interface CreatedIntakeResult {
	item: {
		id: string;
	};
}

type FileWithPath = File & { path?: string };

function splitSourceUrls(value: string): string[] {
	return value
		.split(/\s+/)
		.map((url) => url.trim())
		.filter(Boolean);
}

function filenameFromPath(filePath: string): string {
	return filePath.split(/[\\/]/).filter(Boolean).pop() || filePath;
}

function attachmentFromPath(filePath: string): ComposerAttachment {
	return {
		path: filePath,
		filename: filenameFromPath(filePath),
	};
}

export function IntakeComposer({ open, onOpenChange }: IntakeComposerProps) {
	const activeProjectId = useActiveProjectId();
	const navigate = useNavigate();
	const createDraft = electronTrpc.factory.intake.createDraft.useMutation();
	const fileInputRef = useRef<HTMLInputElement>(null);

	const [titleHint, setTitleHint] = useState("");
	const [operatorText, setOperatorText] = useState("");
	const [sourceUrls, setSourceUrls] = useState("");
	const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
	const [isDragging, setIsDragging] = useState(false);
	const [error, setError] = useState<string | undefined>();

	const resetForm = () => {
		setTitleHint("");
		setOperatorText("");
		setSourceUrls("");
		setAttachments([]);
		setIsDragging(false);
		setError(undefined);
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	const closeComposer = (nextOpen: boolean) => {
		onOpenChange(nextOpen);
		if (!nextOpen) {
			resetForm();
		}
	};

	const addPaths = (paths: string[]) => {
		const nextPaths = paths.map((path) => path.trim()).filter(Boolean);
		if (!nextPaths.length) {
			setError("This file source did not expose a filesystem path.");
			return;
		}
		setError(undefined);
		setAttachments((current) => {
			const known = new Set(current.map((attachment) => attachment.path));
			const next = [...current];
			for (const path of nextPaths) {
				if (!known.has(path)) {
					next.push(attachmentFromPath(path));
					known.add(path);
				}
			}
			return next;
		});
	};

	const addFiles = (files: FileList | null) => {
		if (!files) {
			return;
		}
		const paths = Array.from(files)
			.map((file) => (file as FileWithPath).path || "")
			.filter(Boolean);
		if (paths.length !== files.length) {
			setError(
				"One or more files did not expose a filesystem path. Drag from Explorer or use the desktop file picker.",
			);
		}
		addPaths(paths);
	};

	const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
		setIsDragging(true);
	};

	const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
		if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
			setIsDragging(false);
		}
	};

	const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
	};

	const handleDrop = (event: DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
		setIsDragging(false);
		addFiles(event.dataTransfer.files);
	};

	const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
		addFiles(event.target.files);
	};

	const removeAttachment = (path: string) => {
		setAttachments((current) =>
			current.filter((attachment) => attachment.path !== path),
		);
	};

	const hasInput =
		operatorText.trim().length > 0 ||
		splitSourceUrls(sourceUrls).length > 0 ||
		attachments.length > 0;

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!hasInput) {
			setError("Add notes, at least one source URL, or at least one file path.");
			return;
		}

		setError(undefined);
		try {
			const created = (await createDraft.mutateAsync({
				project_id: activeProjectId,
				title: titleHint.trim() || undefined,
				operator_text: operatorText,
				source_urls: splitSourceUrls(sourceUrls),
				attachment_paths: attachments.map((attachment) => attachment.path),
			})) as CreatedIntakeResult;
			toast.success("Intake created. INTAKE_STEWARD can classify it next.");
			closeComposer(false);
			await navigate({
				to: "/factory/intake/$intakeId",
				params: { intakeId: encodeURIComponent(created.item.id) },
				search: {
					tab: "SUMMARY",
					dialogueId: undefined,
					planTarget: undefined,
				},
			});
		} catch (submitError) {
			setError(
				submitError instanceof Error
					? submitError.message
					: "Unable to create intake.",
			);
		}
	};

	return (
		<Sheet open={open} onOpenChange={closeComposer}>
			<SheetContent className="flex w-[42rem] flex-col gap-0 p-0 sm:max-w-[42rem]">
				<form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
					<SheetHeader className="border-b px-6 py-5">
						<SheetTitle>New intake</SheetTitle>
						<SheetDescription>
							Capture free-form source material for {activeProjectId}. Files are
							referenced by path only.
						</SheetDescription>
					</SheetHeader>

					<ScrollArea className="min-h-0 flex-1">
						<div className="space-y-5 p-6">
							<div className="space-y-2">
								<label className="text-sm font-medium" htmlFor="intake-title">
									Title hint
								</label>
								<Input
									id="intake-title"
									value={titleHint}
									placeholder="Optional title for this intake"
									onChange={(event) => setTitleHint(event.target.value)}
								/>
							</div>

							<div className="space-y-2">
								<label className="text-sm font-medium" htmlFor="intake-notes">
									Free-form notes
								</label>
								<FactoryTextarea
									value={operatorText}
									placeholder="Paste workshop notes, founder brain-dumps, research excerpts, or any raw context."
									onChange={setOperatorText}
								/>
							</div>

							<div className="space-y-2">
								<label className="text-sm font-medium" htmlFor="intake-urls">
									Source URLs
								</label>
								<FactoryTextarea
									value={sourceUrls}
									placeholder="One URL per line, or paste several separated by spaces."
									onChange={setSourceUrls}
								/>
							</div>

							<ComposerDropZone
								isDragging={isDragging}
								error={error}
								onDragEnter={handleDragEnter}
								onDragLeave={handleDragLeave}
								onDragOver={handleDragOver}
								onDrop={handleDrop}
								onPickFiles={() => fileInputRef.current?.click()}
							>
								<input
									ref={fileInputRef}
									type="file"
									multiple
									className="hidden"
									onChange={handleFileInput}
								/>
								{attachments.length === 0 ? (
									<p className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
										No file paths attached yet.
									</p>
								) : (
									<div className="flex flex-wrap gap-2">
										{attachments.map((attachment) => (
											<ComposerAttachmentChip
												key={attachment.path}
												attachment={attachment}
												onRemove={removeAttachment}
											/>
										))}
									</div>
								)}
							</ComposerDropZone>
						</div>
					</ScrollArea>

					<SheetFooter className="border-t p-4">
						<Button
							type="button"
							variant="outline"
							onClick={() => closeComposer(false)}
							disabled={createDraft.isPending}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={!hasInput || createDraft.isPending}>
							{createDraft.isPending && <Loader2 className="size-4 animate-spin" />}
							Create intake
						</Button>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}
