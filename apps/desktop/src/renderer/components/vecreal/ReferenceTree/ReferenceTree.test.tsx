import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoAxeViolations } from "../test-utils";
import { ReferenceTree } from "./ReferenceTree";

describe("ReferenceTree", () => {
	test("renders the approved Phase C contract without a11y violations", async () => {
		const html = renderToStaticMarkup(<ReferenceTree nodes={[{ id: "identity", label: "Identity", state: "satisfied", children: [{ id: "mission", label: "Mission", state: "pending" }] }]} />);
		expect(html).toContain("ReferenceTree");
		expect(html).toContain("@headless-tree/react");
		expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
		await expectNoAxeViolations(html);
	});
});
