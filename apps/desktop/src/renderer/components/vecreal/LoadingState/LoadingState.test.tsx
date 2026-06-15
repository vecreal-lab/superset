import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoAxeViolations } from "../test-utils";
import { LoadingState } from "./LoadingState";

describe("LoadingState", () => {
	test("renders the approved Phase C contract without a11y violations", async () => {
		const html = renderToStaticMarkup(<LoadingState label="Loading runs" variant="panel" />);
		expect(html).toContain("Loading runs");
		expect(html).toContain("aria-busy=\"true\"");
		expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
		await expectNoAxeViolations(html);
	});
});
