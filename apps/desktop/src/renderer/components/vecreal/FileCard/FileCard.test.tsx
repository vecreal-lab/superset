import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoAxeViolations } from "../test-utils";
import { FileCard } from "./FileCard";

describe("FileCard", () => {
	test("renders the approved Phase C contract without a11y violations", async () => {
		const html = renderToStaticMarkup(<FileCard name="receipt.md" type="receipt" status="ready" meta="2 KB" />);
		expect(html).toContain("receipt.md");
		expect(html).toContain("ready");
		expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
		await expectNoAxeViolations(html);
	});
});
