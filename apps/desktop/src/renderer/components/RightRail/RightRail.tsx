import type { RightRailState } from "lib/types/factory-operator-console";
import { useFactoryRightRailLayout } from "lib/stores/workspace";
import { RightRailContextPanel } from "../factory-primitives/RightRailContextPanel";

export interface RightRailProps {
	state: RightRailState;
	onExpandItem?: (itemId: string) => void;
}

export function RightRail({ state, onExpandItem }: RightRailProps) {
	const { collapsed, widthPx, setCollapsed, setWidthPx } =
		useFactoryRightRailLayout();
	return (
		<RightRailContextPanel
			state={{ ...state, collapsed }}
			widthPx={widthPx}
			onWidthChange={setWidthPx}
			onCollapse={() => setCollapsed(!collapsed)}
			onExpandItem={onExpandItem}
		/>
	);
}
