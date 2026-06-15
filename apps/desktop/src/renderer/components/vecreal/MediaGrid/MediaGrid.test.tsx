import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoAxeViolations } from "../test-utils";
import { MediaGrid } from "./MediaGrid";

describe("MediaGrid", () => {
	test("renders the approved Phase C contract without a11y violations", async () => {
		const html = renderToStaticMarkup(<MediaGrid items={[{ id: "one", label: "Mockup one", status: "approved" }, { id: "two", label: "Mockup two", status: "pending" }]} />);
		expect(html).toContain("Mockup one");
		expect(html).toContain("data-vecreal-component=\"MediaGrid\"");
		expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
		await expectNoAxeViolations(html);
	});
});
