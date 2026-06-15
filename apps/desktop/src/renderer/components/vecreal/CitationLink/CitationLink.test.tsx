import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoAxeViolations } from "../test-utils";
import { CitationLink } from "./CitationLink";

describe("CitationLink", () => {
	test("renders the approved Phase C contract without a11y violations", async () => {
		const html = renderToStaticMarkup(<CitationLink href="/source.md" source="section 08">Source</CitationLink>);
		expect(html).toContain("href=\"/source.md\"");
		expect(html).toContain("section 08");
		expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
		await expectNoAxeViolations(html);
	});
});
