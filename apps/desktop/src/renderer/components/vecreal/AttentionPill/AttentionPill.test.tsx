import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoAxeViolations } from "../test-utils";
import { AttentionPill } from "./AttentionPill";

describe("AttentionPill", () => {
	test("renders the approved Phase C contract without a11y violations", async () => {
		const html = renderToStaticMarkup(<AttentionPill count={5} isLive />);
		expect(html).toContain("role=\"status\"");
		expect(html).toContain("5");
		expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
		await expectNoAxeViolations(html);
	});
});
