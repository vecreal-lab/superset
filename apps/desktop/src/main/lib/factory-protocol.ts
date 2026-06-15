import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { net, protocol, session } from "electron";
import { findFactoryRoot } from "./coordinator/prompt-loader";

const FACTORY_PROTOCOL_SCHEME = "factory";
const APP_HOST = "app";

const CONTENT_TYPES: Record<string, string> = {
	".css": "text/css; charset=utf-8",
	".gif": "image/gif",
	".html": "text/html; charset=utf-8",
	".ico": "image/x-icon",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".map": "application/json; charset=utf-8",
	".md": "text/markdown; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
	".webp": "image/webp",
	".woff": "font/woff",
	".woff2": "font/woff2",
};

function isInsidePath(parent: string, candidate: string): boolean {
	const relative = path.relative(parent, candidate);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function decodePathPart(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function normalizeProtocolPath(url: URL): string {
	const hostPart = url.hostname && url.hostname !== APP_HOST ? url.hostname : "";
	const pathPart = decodePathPart(url.pathname || "/");
	const joined = `${hostPart}${pathPart}`.replace(/^\/+/, "");
	return joined || "index.html";
}

function responseForStatus(status: number, message: string): Response {
	return new Response(message, {
		status,
		headers: { "content-type": "text/plain; charset=utf-8" },
	});
}

async function fileResponse(filePath: string): Promise<Response> {
	const fileStat = await stat(filePath);
	if (!fileStat.isFile()) return responseForStatus(404, "Not found");

	const bytes = await readFile(filePath);
	const contentType =
		CONTENT_TYPES[path.extname(filePath).toLowerCase()] ??
		"application/octet-stream";
	return new Response(bytes, {
		headers: {
			"content-type": contentType,
			"content-length": String(bytes.byteLength),
		},
	});
}

async function factoryProtocolHandler(request: Request): Promise<Response> {
	let url: URL;
	try {
		url = new URL(request.url);
	} catch {
		return responseForStatus(400, "Malformed factory protocol URL");
	}

	if (url.hostname === APP_HOST) {
		const rendererRoot = path.resolve(__dirname, "../renderer");
		const relativePath = normalizeProtocolPath(url);
		const resolved = path.resolve(rendererRoot, relativePath);
		if (!isInsidePath(rendererRoot, resolved)) {
			return responseForStatus(403, "Factory app path escapes renderer root");
		}
		try {
			return await fileResponse(resolved);
		} catch {
			return responseForStatus(404, "Factory app resource not found");
		}
	}

	const factoryRoot = findFactoryRoot();
	const relativePath = normalizeProtocolPath(url);
	const resolved = path.resolve(factoryRoot, relativePath);
	if (!isInsidePath(factoryRoot, resolved)) {
		return responseForStatus(403, "Factory resource path escapes factory root");
	}

	try {
		return await fileResponse(resolved);
	} catch {
		try {
			return await net.fetch(pathToFileURL(resolved).toString());
		} catch {
			return responseForStatus(404, "Factory resource not found");
		}
	}
}

export function registerFactoryProtocol(): void {
	protocol.handle(FACTORY_PROTOCOL_SCHEME, factoryProtocolHandler);
	session
		.fromPartition("persist:superset")
		.protocol.handle(FACTORY_PROTOCOL_SCHEME, factoryProtocolHandler);
}

export { FACTORY_PROTOCOL_SCHEME };
