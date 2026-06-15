import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoAxeViolations } from "../test-utils";
import { SearchInput } from "./SearchInput";

describe("SearchInput", () => {
	test("renders the approved Phase C contract without a11y violations", async () => {
		const html = renderToStaticMarkup(<SearchInput label="Find work" results={[{ id: "r1", label: "WO-CL.4", description: "Component batch" }]} />);
		expect(html).toContain("Find work");
		expect(html).toContain("type=\"search\"");
		expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
		await expectNoAxeViolations(html);
	});
});
