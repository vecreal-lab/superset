import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoAxeViolations } from "../test-utils";
import { FormField } from "./FormField";

describe("FormField", () => {
	test("renders the approved Phase C contract without a11y violations", async () => {
		const html = renderToStaticMarkup(<FormField id="project" label="Project" kind="select" options={[{ value: "sf", label: "Software Factory" }]} description="Choose a workspace." />);
		expect(html).toContain("Project");
		expect(html).toContain("Choose a workspace.");
		expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
		await expectNoAxeViolations(html);
	});
});
