import { ToastNotificationViewport } from "renderer/components/vecreal/ToastNotification";
import { useTheme } from "renderer/stores/theme/store";

export function ThemedToaster() {
	const theme = useTheme();
	return <ToastNotificationViewport theme={theme?.type ?? "dark"} />;
}
