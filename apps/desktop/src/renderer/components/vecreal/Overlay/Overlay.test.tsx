import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoAxeViolations } from "../test-utils";
import { Overlay } from "./Overlay";

describe("Overlay", () => {
	test("renders the approved Phase C contract without a11y violations", async () => {
		const html = renderToStaticMarkup(<Overlay kind="modal" title="Preview" trigger={<button type="button">Open</button>} defaultOpen>Body</Overlay>);
		expect(html).toContain("Open");
		expect(html).toContain("aria-haspopup");
		expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
		await expectNoAxeViolations(html);
	});
});
