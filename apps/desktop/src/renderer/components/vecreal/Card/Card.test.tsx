import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoAxeViolations } from "../test-utils";
import { Card } from "./Card";

describe("Card", () => {
	test("renders the approved Phase C contract without a11y violations", async () => {
		const html = renderToStaticMarkup(<Card><strong>Review packet</strong></Card>);
		expect(html).toContain("Review packet");
		expect(html).toContain("data-vecreal-component=\"Card\"");
		expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
		await expectNoAxeViolations(html);
	});
});
