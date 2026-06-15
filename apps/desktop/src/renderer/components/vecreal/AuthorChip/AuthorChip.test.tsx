import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoAxeViolations } from "../test-utils";
import { AuthorChip } from "./AuthorChip";

describe("AuthorChip", () => {
	test("renders the approved Phase C contract without a11y violations", async () => {
		const html = renderToStaticMarkup(<AuthorChip name="ORCH" kind="agent" />);
		expect(html).toContain("ORCH");
		expect(html).toContain("Agent ORCH");
		expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
		await expectNoAxeViolations(html);
	});
});
