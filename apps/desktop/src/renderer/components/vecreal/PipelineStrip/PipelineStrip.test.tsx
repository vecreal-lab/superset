import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoAxeViolations } from "../test-utils";
import { PipelineStrip } from "./PipelineStrip";

describe("PipelineStrip", () => {
	test("renders the approved Phase C contract without a11y violations", async () => {
		const html = renderToStaticMarkup(<PipelineStrip stages={[{ id: "a", label: "Scope", state: "complete" }, { id: "b", label: "Build", state: "active" }]} />);
		expect(html).toContain("Pipeline progress");
		expect(html).toContain("Build");
		expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
		await expectNoAxeViolations(html);
	});
});
