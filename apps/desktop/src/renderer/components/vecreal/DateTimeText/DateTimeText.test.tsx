import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoAxeViolations } from "../test-utils";
import { DateTimeText } from "./DateTimeText";

describe("DateTimeText", () => {
	test("renders the approved Phase C contract without a11y violations", async () => {
		const html = renderToStaticMarkup(<DateTimeText value="2026-05-05T12:00:00.000Z" label="May 5, 2026" />);
		expect(html).toContain("May 5, 2026");
		expect(html).toContain("data-vecreal-component=\"DateTimeText\"");
		expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
		await expectNoAxeViolations(html);
	});
});
