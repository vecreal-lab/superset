import { Button } from "@superset/ui/button";
import { ScrollArea } from "@superset/ui/scroll-area";
import { Textarea } from "@superset/ui/textarea";
import { Send } from "lucide-react";
import { type FormEvent, useId } from "react";
import { LDPAttributedTurn } from "../LDPAttributedTurn";
import { LDPDialogueHeader } from "../LDPDialogueHeader";
import type { LDPDialogueAgent, LDPDialogueTurn } from "../LDPSurface";

interface LDPChatPaneProps {
	agent: LDPDialogueAgent;
	turns: LDPDialogueTurn[];
	value: string;
	placeholder?: string;
	isThinking?: boolean;
	thinkingLabel?: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
}

export function LDPChatPane({
	agent,
	turns,
	value,
	placeholder = "Ask, explore, or propose a change...",
	isThinking,
	thinkingLabel,
	onChange,
	onSubmit,
}: LDPChatPaneProps) {
	const inputId = useId();

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!value.trim()) return;
		onSubmit();
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<LDPDialogueHeader agent={agent} />
			<ScrollArea className="min-h-0 flex-1 px-4 py-3">
				<div className="space-y-3">
					{turns.map((turn) => (
						<LDPAttributedTurn key={turn.id} turn={turn} />
					))}
					{isThinking && (
						<div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
							<span className="inline-flex items-center gap-2">
								<span className="size-2 animate-pulse rounded-full bg-current" />
								{thinkingLabel || `${agent.name} is reading context...`}
							</span>
						</div>
					)}
				</div>
			</ScrollArea>
			<form className="border-t p-3" onSubmit={handleSubmit}>
				<label className="sr-only" htmlFor={inputId}>
					Dialogue input
				</label>
				<Textarea
					id={inputId}
					value={value}
					placeholder={placeholder}
					className="min-h-24 resize-none text-sm"
					onChange={(event) => onChange(event.target.value)}
				/>
				<div className="mt-2 flex justify-end">
					<Button type="submit" size="sm" disabled={!value.trim()}>
						<Send className="size-4" />
						Send
					</Button>
				</div>
			</form>
		</div>
	);
}
