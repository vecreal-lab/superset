/**
 * Parse OSC 7 escape sequences to extract the current working directory.
 * OSC 7 format: ESC]7;<local-file-uri>hostname/path BEL (or ESC\)
 *
 * This is emitted by shells when the directory changes.
 */

const ESC = "\x1b";
const BEL = "\x07";
const LOCAL_FILE_SCHEME_PATTERN = "file:\\/\\/";

// Match OSC 7 directory sequences followed by BEL or ST (ESC\)
const OSC7_PATTERN = new RegExp(
	`${ESC}\\]7;${LOCAL_FILE_SCHEME_PATTERN}[^/]*((?:/[^${BEL}${ESC}]*)*)(?:${BEL}|${ESC}\\\\)`,
	"g",
);

/**
 * Parse terminal output data for OSC 7 directory sequences.
 * Returns the last (most recent) directory found, or null if none.
 */
export function parseCwd(data: string): string | null {
	let lastMatch: string | null = null;

	for (const match of data.matchAll(OSC7_PATTERN)) {
		const path = match[1];
		if (path) {
			try {
				lastMatch = decodeURIComponent(path);
			} catch {
				lastMatch = path;
			}
		}
	}

	return lastMatch;
}
