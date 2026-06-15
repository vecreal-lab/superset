import { r, s, srOnly, textBase, v } from "../componentInternals";

export interface DiffLine {
	id: string;
	type: "added" | "removed" | "changed" | "unchanged";
	text: string;
}

export interface DiffBlockProps {
	lines: DiffLine[];
	label?: string;
}

export function DiffBlock({ lines, label = "Diff" }: DiffBlockProps) {
	return (
		<pre
			aria-label={label}
			data-vecreal-component="DiffBlock"
			style={{
				margin: 0,
				padding: s.px7,
				border: `${v.borderWidth} solid ${v.border}`,
				borderRadius: r.sm,
				background: v.bgSoft,
				color: v.body,
				fontFamily: v.mono,
				fontSize: s.px6,
				overflow: "auto",
			}}
		>
			{lines.map((line) => {
				const sign = line.type === "added" ? "+" : line.type === "removed" ? "-" : line.type === "changed" ? "~" : " ";
				const color = line.type === "added" ? v.success : line.type === "removed" ? v.error : line.type === "changed" ? v.warning : v.body;
				return (
					<span key={line.id} style={{ display: "block", color }}>
						<span aria-hidden="true">{sign}</span>
						<span style={srOnly()}>{line.type}: </span>
						{line.text}
					</span>
				);
			})}
		</pre>
	);
}
