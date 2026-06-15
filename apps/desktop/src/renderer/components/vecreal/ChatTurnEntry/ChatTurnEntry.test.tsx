import { describe, expect, test } from "bun:test";
import { chatTurnEntryLabel } from "./ChatTurnEntry";

describe("ChatTurnEntry", () => {
	test("labels chat turn entries by role", () => {
		expect(chatTurnEntryLabel("operator")).toBe("Operator chat turn");
		expect(chatTurnEntryLabel("agent")).toBe("Agent chat turn");
		expect(chatTurnEntryLabel("system")).toBe("System chat turn");
	});
});
