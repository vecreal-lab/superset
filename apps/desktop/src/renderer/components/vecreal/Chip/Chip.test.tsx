import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoAxeViolations } from "../test-utils";
import { Chip } from "./Chip";

describe("Chip", () => {
	test("renders the approved Phase C contract without a11y violations", async () => {
		const html = renderToStaticMarkup(<Chip tone="clay" selected>Project</Chip>);
		expect(html).toContain("Project");
		expect(html).toContain("data-vecreal-component=\"Chip\"");
		expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
		await expectNoAxeViolations(html);
	});
});
