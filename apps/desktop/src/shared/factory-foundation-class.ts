export const FOUNDATION_OWNER_IDENTITY = "Yuriy";

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

export function isFoundationOwner(operatorName?: string | null): boolean {
	return (
		(operatorName || "").trim().toLowerCase() ===
		FOUNDATION_OWNER_IDENTITY.toLowerCase()
	);
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
