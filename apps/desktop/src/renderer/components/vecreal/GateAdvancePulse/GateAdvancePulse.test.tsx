import { describe, expect, test } from "bun:test";
import { gateAdvancePulseLabel, shouldPulseGateState } from "./GateAdvancePulse";

describe("GateAdvancePulse", () => {
	test("pulses only terminal gate transitions", () => {
		expect(shouldPulseGateState("done")).toBe(true);
		expect(shouldPulseGateState("failed")).toBe(true);
		expect(shouldPulseGateState("active")).toBe(false);
		expect(shouldPulseGateState("pending")).toBe(false);
	});

	test("announces the gate state in plain language", () => {
		expect(gateAdvancePulseLabel("done", "Audit")).toBe("Audit gate advanced");
		expect(gateAdvancePulseLabel("failed", "Audit")).toBe(
			"Audit gate needs revision",
		);
	});
});
