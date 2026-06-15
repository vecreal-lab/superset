import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoAxeViolations } from "../test-utils";
import { FilterSortDrawer } from "./FilterSortDrawer";

describe("FilterSortDrawer", () => {
	test("renders the approved Phase C contract without a11y violations", async () => {
		const html = renderToStaticMarkup(<FilterSortDrawer appliedFilters={["Open", "Needs review"]}>Filter body</FilterSortDrawer>);
		expect(html).toContain("Open");
		expect(html).toContain("Filters");
		expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
		await expectNoAxeViolations(html);
	});
});
