import type { ArtifactReference, RightRailState } from "lib/types/factory-operator-console";
import { useFactoryRightRailLayout } from "lib/stores/workspace";
import { RightRailContextPanel } from "../factory-primitives/RightRailContextPanel";

export interface RightRailProps {
	state: RightRailState;
	onExpandItem?: (itemId: string) => void;
	onOpenReference?: (reference: ArtifactReference) => void;
	onChatWithReference?: (reference: ArtifactReference) => void;
}

export function RightRail({
	state,
	onExpandItem,
	onOpenReference,
	onChatWithReference,
}: RightRailProps) {
	const { collapsed, widthPx, setCollapsed, setWidthPx } =
		useFactoryRightRailLayout();
	return (
		<RightRailContextPanel
			state={{ ...state, collapsed }}
			widthPx={widthPx}
			onWidthChange={setWidthPx}
			onCollapse={() => setCollapsed(!collapsed)}
			onExpandItem={onExpandItem}
			onOpenReference={onOpenReference}
			onChatWithReference={onChatWithReference}
		/>
	);
}
