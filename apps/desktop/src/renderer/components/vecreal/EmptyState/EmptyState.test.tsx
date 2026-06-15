import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoAxeViolations } from "../test-utils";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
	test("renders the approved Phase C contract without a11y violations", async () => {
		const html = renderToStaticMarkup(<EmptyState title="Nothing here" message="Add a filter or clear the search." />);
		expect(html).toContain("Nothing here");
		expect(html).toContain("Add a filter");
		expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
		await expectNoAxeViolations(html);
	});
});
