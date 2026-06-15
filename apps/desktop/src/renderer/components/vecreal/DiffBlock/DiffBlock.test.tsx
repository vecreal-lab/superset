import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoAxeViolations } from "../test-utils";
import { DiffBlock } from "./DiffBlock";

describe("DiffBlock", () => {
	test("renders the approved Phase C contract without a11y violations", async () => {
		const html = renderToStaticMarkup(<DiffBlock lines={[{ id: "1", type: "added", text: "new line" }, { id: "2", type: "removed", text: "old line" }]} />);
		expect(html).toContain("new line");
		expect(html).toContain("data-vecreal-component=\"DiffBlock\"");
		expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
		await expectNoAxeViolations(html);
	});
});
