import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoAxeViolations } from "../test-utils";
import { GateCard } from "./GateCard";

describe("GateCard", () => {
	test("renders the approved Phase C contract without a11y violations", async () => {
		const html = renderToStaticMarkup(<GateCard title="Gate 3" summary="Review visual preview" status="pending" actions={[{ label: "Approve" }]} />);
		expect(html).toContain("Gate 3");
		expect(html).toContain("Approve");
		expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
		await expectNoAxeViolations(html);
	});
});
