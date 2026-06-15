import { DateTimeText } from "./DateTimeText";

export function DateTimeTextPreview() {
	return (
		<div style={{ display: "grid", gap: "var(--sp-6)", padding: "var(--sp-8)", background: "var(--bg-app)", color: "var(--text-primary)" }}>
			<DateTimeText value="2026-05-05T12:00:00.000Z" label="May 5, 2026" />
		</div>
	);
}

export default DateTimeTextPreview;
