import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoAxeViolations } from "../test-utils";
import { IconButton } from "./IconButton";

describe("IconButton", () => {
	test("renders the approved Phase C contract without a11y violations", async () => {
		const html = renderToStaticMarkup(<IconButton label="Open tools">+</IconButton>);
		expect(html).toContain("aria-label=\"Open tools\"");
		expect(html).toContain("data-vecreal-component=\"IconButton\"");
		expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
		await expectNoAxeViolations(html);
	});
});
