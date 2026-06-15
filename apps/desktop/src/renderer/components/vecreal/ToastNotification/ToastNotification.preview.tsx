import { ToastNotification } from "./ToastNotification";

export function ToastNotificationPreview() {
	return (
		<div style={{ display: "grid", gap: "var(--sp-5)" }}>
			<ToastNotification
				tone="success"
				title="Gate advanced"
				description="AUDIT passed and the next stage is ready."
			/>
			<ToastNotification
				tone="warning"
				title="Operator review needed"
				description="A component gap was surfaced for curator follow-up."
			/>
			<ToastNotification
				tone="loading"
				title="Synchronizing"
				description="Refreshing the component status board."
			/>
		</div>
	);
}
