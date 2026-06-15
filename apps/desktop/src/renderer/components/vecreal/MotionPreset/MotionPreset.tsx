import {
	motion,
	useReducedMotion,
	type HTMLMotionProps,
	type Transition,
} from "motion/react";
import { motionTokens } from "../tokens";

export type MotionPresetName =
	| "entry"
	| "exit"
	| "transition"
	| "pulse"
	| "re-anchor"
	| "shimmer";

type MotionDivProps = HTMLMotionProps<"div">;
type ResolvedMotionProps = Pick<
	MotionDivProps,
	"initial" | "animate" | "exit" | "transition" | "layout"
>;

export interface ResolveMotionPresetOptions {
	active?: boolean;
	reducedMotion?: boolean;
}

export interface MotionPresetProps
	extends Omit<
		MotionDivProps,
		"initial" | "animate" | "exit" | "transition" | "layout"
	> {
	preset?: MotionPresetName;
	active?: boolean;
	reduceMotion?: boolean;
	layout?: MotionDivProps["layout"];
}

function durationSeconds(tokenKey: keyof typeof motionTokens): number {
	const value = motionTokens[tokenKey].value;
	const ms = Number.parseFloat(value.replace("ms", ""));
	return Number.isFinite(ms) ? ms / 1000 : 0;
}

function easingTuple(tokenKey: keyof typeof motionTokens): Transition["ease"] {
	const value = motionTokens[tokenKey].value;
	const match = value.match(/cubic-bezier\(([^)]+)\)/);
	if (!match) return undefined;
	const numbers = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
	if (numbers.length !== 4 || numbers.some((number) => !Number.isFinite(number))) {
		return undefined;
	}
	return [numbers[0], numbers[1], numbers[2], numbers[3]];
}

const instantTransition: Transition = {
	duration: durationSeconds("motion-instant"),
};

const fastTransition: Transition = {
	duration: durationSeconds("motion-fast"),
	ease: easingTuple("ease-out"),
};

const baseTransition: Transition = {
	duration: durationSeconds("motion-medium"),
	ease: easingTuple("ease-in-out"),
};

const slowTransition: Transition = {
	duration: durationSeconds("motion-slow"),
	ease: easingTuple("ease-spring"),
};

function reducedMotionProps(): ResolvedMotionProps {
	return {
		initial: false,
		animate: { opacity: 1, x: 0, y: 0, scale: 1 },
		exit: { opacity: 1, x: 0, y: 0, scale: 1 },
		transition: instantTransition,
	};
}

export function resolveMotionPreset(
	preset: MotionPresetName,
	options: ResolveMotionPresetOptions = {},
): ResolvedMotionProps {
	if (options.reducedMotion) return reducedMotionProps();

	switch (preset) {
		case "entry":
			return {
				initial: { opacity: 0, y: "var(--sp-4)" },
				animate: { opacity: 1, y: 0 },
				exit: { opacity: 0, y: "calc(var(--sp-2) * -1)" },
				transition: fastTransition,
			};
		case "exit":
			return {
				initial: { opacity: 1, y: 0 },
				animate: { opacity: 1, y: 0 },
				exit: { opacity: 0, y: "calc(var(--sp-2) * -1)" },
				transition: fastTransition,
			};
		case "pulse":
			return {
				initial: { scale: 1 },
				animate: options.active
					? { scale: [1, 1.035, 1], opacity: [1, 0.92, 1] }
					: { scale: 1, opacity: 1 },
				transition: slowTransition,
			};
		case "re-anchor":
			return {
				initial: false,
				animate: { opacity: 1, x: 0, y: 0 },
				layout: true,
				transition: baseTransition,
			};
		case "shimmer":
			return {
				initial: { backgroundPositionX: "100%" },
				animate: { backgroundPositionX: options.active ? ["100%", "0%"] : "100%" },
				transition: options.active
					? { duration: durationSeconds("motion-page"), ease: "linear", repeat: Infinity }
					: instantTransition,
			};
		case "transition":
		default:
			return {
				initial: false,
				animate: { opacity: 1 },
				transition: baseTransition,
			};
	}
}

export function MotionPreset({
	preset = "transition",
	active = true,
	reduceMotion,
	layout,
	...props
}: MotionPresetProps) {
	const prefersReducedMotion = useReducedMotion();
	const resolved = resolveMotionPreset(preset, {
		active,
		reducedMotion: reduceMotion ?? Boolean(prefersReducedMotion),
	});

	return (
		<motion.div
			data-motion-preset={preset}
			{...resolved}
			layout={layout ?? resolved.layout}
			{...props}
		/>
	);
}
