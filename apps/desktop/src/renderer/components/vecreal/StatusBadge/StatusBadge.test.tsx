import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
	test("renders semantic status text with live-region support", () => {
		const html = renderToStaticMarkup(
			<StatusBadge variant="success" isLive>
				Complete
			</StatusBadge>,
		);

		expect(html).toContain('role="status"');
		expect(html).toContain('aria-live="polite"');
		expect(html).toContain("Complete");
	});

	test("keeps visual values token-backed", () => {
		const html = renderToStaticMarkup(
			<StatusBadge variant="error" size="md">
				Blocked
			</StatusBadge>,
		);

		expect(html).toContain("var(--error)");
		expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
	});
});
