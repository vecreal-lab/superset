import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoAxeViolations } from "../test-utils";
import { ErrorState } from "./ErrorState";

describe("ErrorState", () => {
	test("renders the approved Phase C contract without a11y violations", async () => {
		const html = renderToStaticMarkup(<ErrorState title="Could not load" message="Try again after the run finishes." />);
		expect(html).toContain("Could not load");
		expect(html).toContain("Error");
		expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
		await expectNoAxeViolations(html);
	});
});
