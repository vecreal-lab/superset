import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { ScrollArea } from "@superset/ui/scroll-area";
import { Textarea } from "@superset/ui/textarea";
import { cn } from "@superset/ui/utils";
import { ArrowDown, Send } from "lucide-react";
import { RunStatusBadge } from "renderer/components/factory-primitives/RunStatusBadge";
import {
	type FormEvent,
	useCallback,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
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

const turnClasses: Record<LDPDialogueTurn["kind"], string> = {
	operator: "bg-primary text-primary-foreground",
	agent: "bg-muted/60",
	specialist: "border border-amber-500/40 bg-amber-500/10",
	system: "border border-dashed bg-background text-muted-foreground",
};

function AuthorChip({ turn }: { turn: LDPDialogueTurn }) {
	const label = turn.kind === "operator" ? turn.speaker : turn.roleId || turn.speaker;
	const initials = label
		.split(/[_\s-]+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join("");

	return (
		<span className="inline-flex items-center gap-1.5 rounded-full border bg-background/70 px-2 py-0.5 text-[11px] text-foreground">
			<span className="flex size-4 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
				{initials || "?"}
			</span>
			<span className="font-medium">{label}</span>
			{turn.kind !== "operator" && <span className="text-muted-foreground">agent</span>}
		</span>
	);
}

function LDPChatTurn({ turn }: { turn: LDPDialogueTurn }) {
	return (
		<div className={cn("select-text rounded-md p-3 text-sm", turnClasses[turn.kind])}>
			<div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
				<AuthorChip turn={turn} />
				{turn.roleId && <Badge variant="outline">{turn.roleId}</Badge>}
				{turn.timestamp && <span className="opacity-70">{turn.timestamp}</span>}
			</div>
			<p className="select-text whitespace-pre-wrap leading-relaxed">{turn.content}</p>
		</div>
	);
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
	const scrollShellRef = useRef<HTMLDivElement | null>(null);
	const viewportRef = useRef<HTMLElement | null>(null);
	const isAtBottomRef = useRef(true);
	const [isAtBottom, setIsAtBottom] = useState(true);
	const [hasNewContent, setHasNewContent] = useState(false);
	const contentKey = useMemo(
		() =>
			JSON.stringify({
				turns: turns.map((turn) => [turn.id, turn.content.length]),
				isThinking: Boolean(isThinking),
				thinkingLabel,
			}),
		[isThinking, thinkingLabel, turns],
	);

	const getViewport = useCallback(() => {
		if (viewportRef.current) return viewportRef.current;
		viewportRef.current =
			scrollShellRef.current?.querySelector<HTMLElement>(
				'[data-slot="scroll-area-viewport"]',
			) || null;
		return viewportRef.current;
	}, []);

	const updateStickiness = useCallback(() => {
		const viewport = getViewport();
		if (!viewport) return;
		const nextIsAtBottom =
			viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 50;
		isAtBottomRef.current = nextIsAtBottom;
		setIsAtBottom(nextIsAtBottom);
		if (nextIsAtBottom) {
			setHasNewContent(false);
		}
	}, [getViewport]);

	const scrollToBottom = useCallback(() => {
		const viewport = getViewport();
		if (!viewport) return;
		viewport.scrollTop = viewport.scrollHeight;
		isAtBottomRef.current = true;
		setIsAtBottom(true);
		setHasNewContent(false);
	}, [getViewport]);

	useLayoutEffect(() => {
		const viewport = getViewport();
		if (!viewport) return undefined;
		updateStickiness();
		viewport.addEventListener("scroll", updateStickiness, { passive: true });
		return () => viewport.removeEventListener("scroll", updateStickiness);
	}, [getViewport, updateStickiness]);

	useLayoutEffect(() => {
		const viewport = getViewport();
		if (!viewport) return;
		if (isAtBottomRef.current) {
			viewport.scrollTop = viewport.scrollHeight;
			setHasNewContent(false);
			return;
		}
		setHasNewContent(true);
	}, [contentKey, getViewport]);

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!value.trim()) return;
		onSubmit();
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<LDPDialogueHeader agent={agent} />
			<div ref={scrollShellRef} className="relative min-h-0 flex-1">
				<ScrollArea className="h-full px-4 py-3">
					<div className="space-y-3">
						{turns.map((turn) => (
							<LDPChatTurn key={turn.id} turn={turn} />
						))}
						{isThinking && (
							<div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
								<span className="inline-flex items-center gap-2">
									<RunStatusBadge state="running" />
									{thinkingLabel || `${agent.name} is reading context...`}
								</span>
							</div>
						)}
					</div>
				</ScrollArea>
				{!isAtBottom && hasNewContent && (
					<Button
						type="button"
						size="sm"
						variant="secondary"
						className="absolute right-4 bottom-4 shadow"
						onClick={scrollToBottom}
					>
						<ArrowDown className="size-4" />
						New messages
					</Button>
				)}
			</div>
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
