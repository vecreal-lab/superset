import type { MockupBundle } from "lib/types/factory-operator-console";
import { PrimitiveButton, mutedTextStyle, stackStyle } from "../common";
import { MockupRenderer } from "../MockupRenderer";

export interface MockupApprovalGridProps {
	bundle: MockupBundle;
	onBundleApprove?: () => void;
	onMockupRevise?: (index: number, guidance: string) => void;
}

export function MockupApprovalGrid({
	bundle,
	onBundleApprove,
	onMockupRevise,
}: MockupApprovalGridProps) {
	return (
		<section style={stackStyle} aria-label="Mockup approval grid">
			<header style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-6)" }}>
				<div>
					<strong>Mockup bundle</strong>
					<div style={mutedTextStyle}>
						{bundle.mockups.length} mockups / revision {bundle.revisionCount}
					</div>
				</div>
				<PrimitiveButton variant="secondary" onClick={onBundleApprove}>
					Approve bundle
				</PrimitiveButton>
			</header>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(var(--sp-14), 1fr))",
					gap: "var(--sp-6)",
				}}
			>
				{bundle.mockups.map((mockup) => (
					<MockupRenderer
						key={`${mockup.path}-${mockup.index}`}
						mockup={mockup}
						size="thumbnail"
						onRequestRevision={
							onMockupRevise
								? (guidance) => onMockupRevise(mockup.index, guidance)
								: undefined
						}
					/>
				))}
			</div>
		</section>
	);
}
