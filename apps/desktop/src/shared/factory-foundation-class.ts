export const DEFAULT_FOUNDATION_OWNER_IDENTITY = "yuriy";

export interface FoundationClassPathInfo {
	relativePath: string;
	projectId: string;
	isShared: boolean;
	foundationsRoot: string;
	artifactPath: string;
	fileName: string;
}

export interface FoundationLockDateUpdate {
	content: string;
	commitDate: string;
	previousLockText: string | null;
	nextLockText: string;
	changed: boolean;
}

export interface FoundationOwnerPolicy {
	documentPath: string;
	projectId: string;
	isShared: boolean;
	ownershipScope: "project" | "shared";
	requiredOwner: string;
	authorizedOwners: string[];
	ownerLabel: string;
	ownerSourcePath: string;
}

export type FoundationAuditPolicyStatus =
	| "clean"
	| "blocker"
	| "route_to_foundation_commit";

export interface FoundationClassAuditPolicyInput {
	changedPaths: string[];
	foundationClassAmendment?: boolean;
	ownerApprovalOperator?: string | null;
	ownerApprovalEvidence?: string | null;
	ownerPolicyByPath?: Record<string, FoundationOwnerPolicy>;
}

export interface FoundationClassAuditPolicyResult {
	status: FoundationAuditPolicyStatus;
	foundationClassPaths: string[];
	blockerMessage?: string;
	routeSurface?: string;
	requiredOwners: string[];
	ownerApprovalOperator?: string;
}

export function normalizeFactoryPath(value: string): string {
	return value.trim().replace(/\\/g, "/").replace(/^\.\/+/, "");
}

export function getFoundationClassPathInfo(
	relativePath: string,
): FoundationClassPathInfo | null {
	const normalized = normalizeFactoryPath(relativePath);
	const match = /^projects\/(.+)\/foundations\/(.+)$/.exec(normalized);
	if (!match) return null;
	const [, projectId, artifactPath] = match;
	if (
		!projectId ||
		!artifactPath ||
		projectId.includes("..") ||
		artifactPath.includes("../")
	) {
		return null;
	}
	const fileName = artifactPath.split("/").at(-1) || artifactPath;
	return {
		relativePath: normalized,
		projectId,
		isShared: projectId === "_shared",
		foundationsRoot: `projects/${projectId}/foundations`,
		artifactPath,
		fileName,
	};
}

export function isFoundationClassPath(relativePath: string): boolean {
	return Boolean(getFoundationClassPathInfo(relativePath));
}

export function isFoundationClassSurface(surface: string): boolean {
	return normalizeFactoryPath(surface).split("/").at(0) === "foundations";
}

export function normalizeOperatorIdentity(value?: string | null): string {
	return (value || "").trim().toLowerCase();
}

export function ownerDisplayName(owner: string): string {
	const normalized = normalizeOperatorIdentity(owner);
	return normalized || DEFAULT_FOUNDATION_OWNER_IDENTITY;
}

export function isFoundationOwner(
	operatorName?: string | null,
	policyOrOwner?: FoundationOwnerPolicy | string | null,
): boolean {
	const operator = normalizeOperatorIdentity(operatorName);
	if (!operator) return false;
	if (!policyOrOwner) {
		return operator === normalizeOperatorIdentity(DEFAULT_FOUNDATION_OWNER_IDENTITY);
	}
	if (typeof policyOrOwner === "string") {
		return operator === normalizeOperatorIdentity(policyOrOwner);
	}
	return policyOrOwner.authorizedOwners
		.map((owner) => normalizeOperatorIdentity(owner))
		.includes(operator);
}

export function foundationSurfaceFromPath(relativePath: string): string {
	const info = getFoundationClassPathInfo(relativePath);
	if (!info) return "foundations";
	const artifact = info.artifactPath
		.replace(/\.md$/i, "")
		.replace(/^INDEX$/i, "index")
		.toLowerCase();
	return `foundations/${artifact}`;
}

function uniqueStrings(values: string[]): string[] {
	const seen = new Set<string>();
	const unique: string[] = [];
	for (const value of values) {
		const normalized = normalizeOperatorIdentity(value);
		if (!normalized || seen.has(normalized)) continue;
		seen.add(normalized);
		unique.push(normalized);
	}
	return unique;
}

export function evaluateFoundationClassAuditPolicy(
	input: FoundationClassAuditPolicyInput,
): FoundationClassAuditPolicyResult {
	const foundationClassPaths = input.changedPaths
		.map((changedPath) => normalizeFactoryPath(changedPath))
		.filter((changedPath) => isFoundationClassPath(changedPath));
	if (foundationClassPaths.length === 0) {
		return {
			status: "clean",
			foundationClassPaths: [],
			requiredOwners: [],
			ownerApprovalOperator: input.ownerApprovalOperator || undefined,
		};
	}

	const policies = foundationClassPaths
		.map((changedPath) => input.ownerPolicyByPath?.[changedPath])
		.filter((policy): policy is FoundationOwnerPolicy => Boolean(policy));
	const requiredOwners = uniqueStrings(
		policies.flatMap((policy) => policy.authorizedOwners),
	);

	if (!input.foundationClassAmendment) {
		return {
			status: "blocker",
			foundationClassPaths,
			requiredOwners,
			ownerApprovalOperator: input.ownerApprovalOperator || undefined,
			blockerMessage:
				"Regular work orders cannot write foundation-class files. Route the change through the Foundations surface with foundation_class_amendment: true and owner approval.",
		};
	}

	if (!(input.ownerApprovalEvidence || "").trim()) {
		return {
			status: "blocker",
			foundationClassPaths,
			requiredOwners,
			ownerApprovalOperator: input.ownerApprovalOperator || undefined,
			blockerMessage:
				"Foundation-class amendment work orders need owner approval evidence before AUDIT can route them to the Foundations commit flow.",
		};
	}

	if (policies.length > 0) {
		const unauthorizedPolicy = policies.find(
			(policy) => !isFoundationOwner(input.ownerApprovalOperator, policy),
		);
		if (unauthorizedPolicy) {
			return {
				status: "blocker",
				foundationClassPaths,
				requiredOwners,
				ownerApprovalOperator: input.ownerApprovalOperator || undefined,
				blockerMessage: `Foundation-class approval must come from ${unauthorizedPolicy.ownerLabel}.`,
			};
		}
	}

	return {
		status: "route_to_foundation_commit",
		foundationClassPaths,
		requiredOwners,
		routeSurface: foundationSurfaceFromPath(foundationClassPaths[0] || ""),
		ownerApprovalOperator: input.ownerApprovalOperator || undefined,
	};
}

function normalizeCommitDate(commitDate: string): string {
	const match = /^\d{4}-\d{2}-\d{2}/.exec(commitDate.trim());
	return match?.[0] || commitDate.trim();
}

function findHeaderLine(
	lines: string[],
	pattern: RegExp,
	limit = 15,
): number {
	const max = Math.min(lines.length, limit);
	for (let index = 0; index < max; index += 1) {
		if (pattern.test(lines[index] || "")) return index;
	}
	return -1;
}

export function applyFoundationLockDate(
	content: string,
	commitDate: string,
): FoundationLockDateUpdate {
	const normalizedDate = normalizeCommitDate(commitDate);
	const lines = content.replace(/\r\n/g, "\n").split("\n");
	const lockLineIndex = findHeaderLine(lines, /^\s*Lock-date\s*:/i);
	const dateLineIndex = findHeaderLine(lines, /^\s*Date\s*:/i);

	if (lockLineIndex >= 0) {
		const previousLockText = lines[lockLineIndex]!.trim();
		if (previousLockText.includes(normalizedDate)) {
			return {
				content,
				commitDate: normalizedDate,
				previousLockText,
				nextLockText: previousLockText,
				changed: false,
			};
		}
		const nextLockText = `Lock-date: ${normalizedDate} (previous: ${previousLockText})`;
		lines[lockLineIndex] = nextLockText;
		return {
			content: lines.join("\n"),
			commitDate: normalizedDate,
			previousLockText,
			nextLockText,
			changed: true,
		};
	}

	if (dateLineIndex >= 0) {
		const previousLockText = lines[dateLineIndex]!.trim();
		const nextLockText = `Lock-date: ${normalizedDate} (previous: ${previousLockText})`;
		lines.splice(dateLineIndex + 1, 0, nextLockText);
		return {
			content: lines.join("\n"),
			commitDate: normalizedDate,
			previousLockText,
			nextLockText,
			changed: true,
		};
	}

	const headingIndex = findHeaderLine(lines, /^#\s+/, 5);
	const insertIndex = headingIndex >= 0 ? headingIndex + 1 : 0;
	const nextLockText = `Lock-date: ${normalizedDate}`;
	lines.splice(insertIndex, 0, nextLockText);
	return {
		content: lines.join("\n"),
		commitDate: normalizedDate,
		previousLockText: null,
		nextLockText,
		changed: true,
	};
}
