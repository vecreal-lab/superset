import { Card } from "./Card";

export function CardPreview() {
	return (
		<div style={{ display: "grid", gap: "var(--sp-6)", padding: "var(--sp-8)", background: "var(--bg-app)", color: "var(--text-primary)" }}>
			<Card><strong>Review packet</strong></Card>
		</div>
	);
}

export default CardPreview;
