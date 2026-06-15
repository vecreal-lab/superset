import { useEffect, useRef, useState, type ReactNode } from "react";
import { MotionPreset } from "../MotionPreset";

export type GateAdvanceState = "pending" | "active" | "done" | "failed";

export interface GateAdvancePulseProps {
	state: GateAdvanceState;
	label?: string;
	children: ReactNode;
	pulseOnMount?: boolean;
	pulseOnStateChange?: boolean;
}

export function shouldPulseGateState(state: GateAdvanceState) {
	return state === "done" || state === "failed";
}

export function gateAdvancePulseLabel(state: GateAdvanceState, label?: string) {
	const name = label ? `${label} gate` : "Pipeline gate";
	if (state === "done") return `${name} advanced`;
	if (state === "failed") return `${name} needs revision`;
	if (state === "active") return `${name} active`;
	return `${name} pending`;
}

export function GateAdvancePulse({
	state,
	label,
	children,
	pulseOnMount = false,
	pulseOnStateChange = true,
}: GateAdvancePulseProps) {
	const previousStateRef = useRef(state);
	const [pulseCycle, setPulseCycle] = useState(() =>
		pulseOnMount && shouldPulseGateState(state) ? 1 : 0,
	);

	useEffect(() => {
		if (previousStateRef.current !== state) {
			const shouldPulse = pulseOnStateChange && shouldPulseGateState(state);
			previousStateRef.current = state;
			if (shouldPulse) setPulseCycle((cycle) => cycle + 1);
		}
	}, [pulseOnStateChange, state]);

	return (
		<MotionPreset
			key={pulseCycle}
			preset={pulseCycle > 0 ? "pulse" : "transition"}
			active={pulseCycle > 0}
			aria-label={gateAdvancePulseLabel(state, label)}
			data-gate-advance-state={state}
			style={{
				display: "inline-grid",
				placeItems: "center",
				borderRadius: "var(--r-full)",
				outline:
					state === "done" || state === "failed"
						? "var(--factory-border-width) solid currentColor"
						: undefined,
				outlineOffset: "var(--sp-1)",
			}}
		>
			{children}
		</MotionPreset>
	);
}
