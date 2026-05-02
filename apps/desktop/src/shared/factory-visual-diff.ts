export type VisualDiffLineKind = "context" | "added" | "removed";

export interface VisualDiffLine {
	id: string;
	kind: VisualDiffLineKind;
	oldLineNumber: number | null;
	newLineNumber: number | null;
	content: string;
}

function splitComparableLines(value: string): string[] {
	const normalized = value.replace(/\r\n/g, "\n");
	const lines = normalized.split("\n");
	if (lines.length > 1 && lines.at(-1) === "") lines.pop();
	return lines;
}

function buildLcsTable(beforeLines: string[], afterLines: string[]): number[][] {
	const table = Array.from({ length: beforeLines.length + 1 }, () =>
		Array.from({ length: afterLines.length + 1 }, () => 0),
	);
	for (let beforeIndex = beforeLines.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
		for (let afterIndex = afterLines.length - 1; afterIndex >= 0; afterIndex -= 1) {
			table[beforeIndex]![afterIndex] =
				beforeLines[beforeIndex] === afterLines[afterIndex]
					? table[beforeIndex + 1]![afterIndex + 1]! + 1
					: Math.max(
							table[beforeIndex + 1]![afterIndex]!,
							table[beforeIndex]![afterIndex + 1]!,
						);
		}
	}
	return table;
}

export function buildLineVisualDiff(before: string, after: string): VisualDiffLine[] {
	const beforeLines = splitComparableLines(before);
	const afterLines = splitComparableLines(after);
	const table = buildLcsTable(beforeLines, afterLines);
	const lines: VisualDiffLine[] = [];
	let beforeIndex = 0;
	let afterIndex = 0;

	while (beforeIndex < beforeLines.length || afterIndex < afterLines.length) {
		if (
			beforeIndex < beforeLines.length &&
			afterIndex < afterLines.length &&
			beforeLines[beforeIndex] === afterLines[afterIndex]
		) {
			lines.push({
				id: `context-${beforeIndex}-${afterIndex}`,
				kind: "context",
				oldLineNumber: beforeIndex + 1,
				newLineNumber: afterIndex + 1,
				content: beforeLines[beforeIndex]!,
			});
			beforeIndex += 1;
			afterIndex += 1;
			continue;
		}

		if (
			afterIndex < afterLines.length &&
			(beforeIndex >= beforeLines.length ||
				table[beforeIndex]![afterIndex + 1]! >=
					table[beforeIndex + 1]![afterIndex]!)
		) {
			lines.push({
				id: `added-${beforeIndex}-${afterIndex}`,
				kind: "added",
				oldLineNumber: null,
				newLineNumber: afterIndex + 1,
				content: afterLines[afterIndex]!,
			});
			afterIndex += 1;
			continue;
		}

		if (beforeIndex < beforeLines.length) {
			lines.push({
				id: `removed-${beforeIndex}-${afterIndex}`,
				kind: "removed",
				oldLineNumber: beforeIndex + 1,
				newLineNumber: null,
				content: beforeLines[beforeIndex]!,
			});
			beforeIndex += 1;
		}
	}

	return lines;
}

export function buildUnifiedTextDiff(
	before: string,
	after: string,
	options: { beforeLabel?: string; afterLabel?: string } = {},
): string {
	const lines = buildLineVisualDiff(before, after);
	if (before === after) return "(no changes)";
	const beforeLabel = options.beforeLabel || "before";
	const afterLabel = options.afterLabel || "after";
	return [
		`--- ${beforeLabel}`,
		`+++ ${afterLabel}`,
		...lines.map((line) => {
			const prefix =
				line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " ";
			return `${prefix}${line.content}`;
		}),
	].join("\n");
}
