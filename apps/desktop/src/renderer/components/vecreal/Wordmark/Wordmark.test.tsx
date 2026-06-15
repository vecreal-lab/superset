import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoAxeViolations } from "../test-utils";
import { Wordmark } from "./Wordmark";

describe("Wordmark", () => {
	test("renders the approved Phase C contract without a11y violations", async () => {
		const html = renderToStaticMarkup(<Wordmark size="titlebar" tone="dark" />);
		expect(html).toContain("Vecreal");
		expect(html).toContain("data-vecreal-component=\"Wordmark\"");
		expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
		await expectNoAxeViolations(html);
	});
});
