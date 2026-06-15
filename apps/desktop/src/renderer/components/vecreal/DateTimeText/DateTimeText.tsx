import { s, textBase, v } from "../componentInternals";

export interface DateTimeTextProps {
	value: string | Date;
	label?: string;
	mode?: "absolute" | "relative" | "deadline";
	state?: "default" | "upcoming" | "stale" | "overdue";
}

export function DateTimeText({ value, label, mode = "absolute", state = "default" }: DateTimeTextProps) {
	const date = value instanceof Date ? value : new Date(value);
	const dateTime = Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
	const text = label ?? (Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString());
	const color = state === "overdue" ? v.error : state === "stale" ? v.warning : state === "upcoming" ? v.info : v.muted;
	return (
		<time
			dateTime={dateTime}
			data-vecreal-component="DateTimeText"
			data-mode={mode}
			data-state={state}
			style={{
				...textBase,
				color,
				fontFamily: mode === "absolute" ? v.mono : v.font,
				fontSize: s.px6,
				lineHeight: 1.4,
			}}
		>
			{text}
		</time>
	);
}
