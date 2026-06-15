import { describe, expect, test } from "bun:test";
import { resolveMotionPreset } from "./MotionPreset";

describe("MotionPreset", () => {
	test("uses reduced-motion no-op props when requested", () => {
		const props = resolveMotionPreset("entry", { reducedMotion: true });

		expect(props.transition).toEqual({ duration: 0 });
		expect(props.animate).toEqual({ opacity: 1, x: 0, y: 0, scale: 1 });
	});

	test("uses token-derived entry timing", () => {
		const props = resolveMotionPreset("entry");

		expect(props.initial).toEqual({ opacity: 0, y: "var(--sp-4)" });
		expect(props.transition).toMatchObject({ duration: 0.12 });
	});

	test("enables layout for re-anchor motion", () => {
		const props = resolveMotionPreset("re-anchor");

		expect(props.layout).toBe(true);
	});
});
