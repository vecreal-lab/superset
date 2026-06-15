import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoAxeViolations } from "../test-utils";
import { BulkActionsBar } from "./BulkActionsBar";

describe("BulkActionsBar", () => {
	test("renders the approved Phase C contract without a11y violations", async () => {
		const html = renderToStaticMarkup(<BulkActionsBar selectedCount={2} actions={[{ id: "mark", label: "Mark reviewed" }]} />);
		expect(html).toContain("2 selected");
		expect(html).toContain("Actions");
		expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
		await expectNoAxeViolations(html);
	});
});
