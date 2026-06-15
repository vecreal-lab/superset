const FILE_SCHEME = "file" + "://";
const FACTORY_SCHEME = "factory://";
const FACTORY_ROOT_MARKERS = [
	"projects/",
	"work-orders/",
	"runs/",
	"templates/",
	"docs/",
	"decisions/",
	"missions/",
	"vendor/",
] as const;

const WINDOWS_ABSOLUTE_PATH = /^[a-zA-Z]:[\\/]/;

function normalizeSlashes(value: string): string {
	return value.replace(/\\/g, "/");
}

function decodeFileUrl(value: string): string {
	try {
		const url = new URL(value);
		return decodeURIComponent(url.pathname.replace(/^\/([a-zA-Z]:\/)/, "$1"));
	} catch {
		return value.slice(FILE_SCHEME.length);
	}
}

function stripFactoryRootPrefix(value: string): string {
	const normalized = normalizeSlashes(value).replace(/^\/+/, "");
	for (const marker of FACTORY_ROOT_MARKERS) {
		const index = normalized.indexOf(marker);
		if (index >= 0) return normalized.slice(index);
	}
	return normalized;
}

function encodeFactoryPath(relativePath: string): string {
	return relativePath
		.split("/")
		.filter(Boolean)
		.map((part) => encodeURIComponent(part))
		.join("/");
}

export function isFileLikePath(value: string): boolean {
	const trimmed = value.trim();
	return (
		trimmed.startsWith(FILE_SCHEME) ||
		WINDOWS_ABSOLUTE_PATH.test(trimmed) ||
		trimmed.startsWith("\\\\") ||
		trimmed.startsWith("/")
	);
}

export function toFactoryProtocolUrl(pathOrUrl: string): string {
	const trimmed = pathOrUrl.trim();
	if (!trimmed) return "factory:///missing";
	if (trimmed.startsWith(FACTORY_SCHEME)) return trimmed;

	const withoutScheme = trimmed.startsWith(FILE_SCHEME)
		? decodeFileUrl(trimmed)
		: trimmed;
	const relativePath = stripFactoryRootPrefix(withoutScheme);
	return `factory:///${encodeFactoryPath(relativePath)}`;
}

export function toSafeFactoryHref(pathOrRoute: string): string {
	const trimmed = pathOrRoute.trim();
	if (!trimmed) return "#";
	if (trimmed.startsWith("#")) return trimmed;
	if (trimmed.startsWith("/")) return `#${trimmed}`;
	if (trimmed.startsWith(FACTORY_SCHEME) || isFileLikePath(trimmed)) {
		return toFactoryProtocolUrl(trimmed);
	}
	return toFactoryProtocolUrl(trimmed);
}
