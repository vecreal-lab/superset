const CHANGE_VERB_PATTERN =
	/\b(change\w*|edit\w*|updat\w*|rewrit\w*|replac\w*|revis\w*|strengthen\w*|weaken\w*|remov\w*|add\w*|drop\w*|delet\w*|scrap\w*|skip\w*|cut\w*|modif\w*|alter\w*|adjust\w*|refactor\w*)\b|\bpull(?:\s+\w+){0,3}\s+out\b/;

const EXPLICIT_IMPACT_PATTERN =
	/\b(walk\s+me\s+through\s+the\s+impact|what(?:'s|\s+is)\s+the\s+impact|what\s+would\s+the\s+impact\s+be|show\s+me\s+the\s+cascade|tell\s+me\s+the\s+impact\s+of)\b/;

const CONDITIONAL_CHANGE_PATTERN =
	/\b(if\s+i\s+(?:change\w*|edit\w*|updat\w*|rewrit\w*|replac\w*|revis\w*|strengthen\w*|weaken\w*|remov\w*|add\w*|drop\w*|delet\w*|scrap\w*|skip\w*|cut\w*|modif\w*|alter\w*|adjust\w*|refactor\w*|pull(?:\s+\w+){0,3}\s+out)|i(?:'m|\s+am)\s+thinking\s+of\s+(?:changing|editing|updating|rewriting|replacing|revising|strengthening|weakening|removing|adding|dropping|deleting|scrapping|skipping|cutting|modifying|altering|adjusting|refactoring|pulling(?:\s+\w+){0,3}\s+out))\b/;

export function isChangeProposalIntent(message: string): boolean {
	const normalized = message.trim().toLowerCase();
	return (
		CHANGE_VERB_PATTERN.test(normalized) ||
		EXPLICIT_IMPACT_PATTERN.test(normalized) ||
		CONDITIONAL_CHANGE_PATTERN.test(normalized)
	);
}
