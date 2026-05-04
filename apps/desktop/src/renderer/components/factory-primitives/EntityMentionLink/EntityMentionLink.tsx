import type {
	ArtifactReference,
	HyperlinkedEntityMention,
} from "lib/types/factory-operator-console";
import { cx } from "../common";

export interface EntityMentionLinkProps {
	mention?: HyperlinkedEntityMention;
	reference?: ArtifactReference;
	children?: string;
	onActivate?: (reference: ArtifactReference) => void;
	className?: string;
}

export function EntityMentionLink({
	mention,
	reference = mention?.reference,
	children,
	onActivate,
	className,
}: EntityMentionLinkProps) {
	if (!reference) return <span>{children}</span>;
	const label = children || mention?.displayText || reference.label;
	const href = reference.route || reference.path || `/factory/references/${reference.referenceId}`;
	return (
		<a
			className={cx("factory-entity-mention", className)}
			href={href}
			data-rail-target={reference.referenceId}
			data-rail-target-kind={reference.kind}
			onClick={(event) => {
				if (!onActivate) return;
				event.preventDefault();
				onActivate(reference);
			}}
		>
			{label}
		</a>
	);
}
