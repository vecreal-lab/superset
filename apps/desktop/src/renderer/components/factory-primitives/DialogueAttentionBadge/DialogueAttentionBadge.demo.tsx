import { DialogueAttentionBadge } from "./DialogueAttentionBadge";

export function DialogueAttentionBadgeDemo() {
	return (
		<div style={{ display: "flex", gap: "var(--sp-4)" }}>
			<DialogueAttentionBadge count={3} hasMineAttention />
			<DialogueAttentionBadge count={18} hasMineAttention={false} />
			<DialogueAttentionBadge count={108} hasMineAttention />
		</div>
	);
}
