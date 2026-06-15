import type { ReactNode } from "react";
import { MotionPreset } from "../MotionPreset";

export type ChatTurnEntryRole = "operator" | "agent" | "system";

export interface ChatTurnEntryProps {
	turnId: string;
	role: ChatTurnEntryRole;
	children: ReactNode;
}

export function chatTurnEntryLabel(role: ChatTurnEntryRole) {
	if (role === "operator") return "Operator chat turn";
	if (role === "agent") return "Agent chat turn";
	return "System chat turn";
}

export function ChatTurnEntry({ turnId, role, children }: ChatTurnEntryProps) {
	return (
		<MotionPreset
			preset="entry"
			data-chat-turn-entry={turnId}
			data-chat-turn-role={role}
			aria-label={chatTurnEntryLabel(role)}
			style={{
				display: "grid",
				width: "100%",
				minWidth: 0,
			}}
		>
			{children}
		</MotionPreset>
	);
}
