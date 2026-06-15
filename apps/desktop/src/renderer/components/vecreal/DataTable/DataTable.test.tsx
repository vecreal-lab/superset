import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoAxeViolations } from "../test-utils";
import { DataTable } from "./DataTable";

describe("DataTable", () => {
	test("renders the approved Phase C contract without a11y violations", async () => {
		const html = renderToStaticMarkup(<DataTable data={[{ name: "Gate", state: "pending" }]} columns={[{ id: "name", header: "Name", accessorKey: "name" }, { id: "state", header: "State", accessorKey: "state" }]} />);
		expect(html).toContain("Name");
		expect(html).toContain("pending");
		expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
		await expectNoAxeViolations(html);
	});
});
