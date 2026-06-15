import { describe, expect, test } from "bun:test";
import { toastNotificationAriaLive, toastNotificationClassNames } from "./ToastNotification";

describe("ToastNotification", () => {
	test("uses assertive live region for warning and error", () => {
		expect(toastNotificationAriaLive("warning")).toBe("assertive");
		expect(toastNotificationAriaLive("error")).toBe("assertive");
	});

	test("uses polite live region for routine toast tones", () => {
		expect(toastNotificationAriaLive("success")).toBe("polite");
		expect(toastNotificationAriaLive("info")).toBe("polite");
		expect(toastNotificationAriaLive("loading")).toBe("polite");
	});

	test("exposes stable sonner class hooks for viewport migration", () => {
		expect(toastNotificationClassNames.toast).toBe("vecreal-toast-notification");
	});
});
