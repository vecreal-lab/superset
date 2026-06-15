import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoAxeViolations } from "../test-utils";
import { AuditLogEntry } from "./AuditLogEntry";

describe("AuditLogEntry", () => {
	test("renders the approved Phase C contract without a11y violations", async () => {
		const html = renderToStaticMarkup(<AuditLogEntry title="Audit passed" source="AUDIT" time="2026-05-05T12:00:00.000Z">Clean</AuditLogEntry>);
		expect(html).toContain("Audit passed");
		expect(html).toContain("AUDIT");
		expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
		await expectNoAxeViolations(html);
	});
});
