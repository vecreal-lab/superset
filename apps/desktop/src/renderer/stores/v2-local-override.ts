import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface V2LocalOverrideState {
	/** When true, the user is on v2. v2 is gated behind both the remote flag and this opt-in. */
	optInV2: boolean;
	setOptInV2: (optInV2: boolean) => void;
}

export const useV2LocalOverrideStore = create<V2LocalOverrideState>()(
	devtools(
		persist(
			(set) => ({
				optInV2: true,
				setOptInV2: (optInV2) => set({ optInV2 }),
			}),
			{ name: "v2-local-override-v3" },
		),
		{ name: "V2LocalOverrideStore" },
	),
);
