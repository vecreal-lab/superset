import type { BrowserWindow } from "electron";
import { env } from "shared/env.shared";

/** Window IDs defined in the router configuration */
type WindowId = "main" | "about";

/**
 * Load an Electron window with the appropriate URL for TanStack Router.
 * Uses hash-based routing for compatibility with the packaged desktop shell.
 *
 * - Development: loads from Vite dev server at http://localhost:PORT/#/
 * - Production: loads from the factory protocol with hash routing (#/)
 */
export function registerRoute(props: {
	id: WindowId;
	browserWindow: BrowserWindow;
	htmlFile: string;
	query?: Record<string, string>;
}): void {
	const isDev = env.NODE_ENV === "development";
	const initialPath =
		process.env.FACTORY_LOCAL_ONLY === "true" ? "/factory" : "/";

	if (isDev) {
		// Development: load from Vite dev server with hash routing
		const url = `http://localhost:${env.DESKTOP_VITE_PORT}/#${initialPath}`;
		console.log("[window-loader] Loading development URL:", url);
		props.browserWindow.loadURL(url);
	} else {
		const url = `factory://app/index.html#${initialPath}`;
		console.log("[window-loader] Loading packaged factory URL:", url);
		props.browserWindow.loadURL(url);
	}

	// Log successful loads
	props.browserWindow.webContents.on("did-finish-load", () => {
		console.log(
			"[window-loader] Successfully loaded:",
			props.browserWindow.webContents.getURL(),
		);
	});

	// Log and handle load failures
	props.browserWindow.webContents.on(
		"did-fail-load",
		(_event, errorCode, errorDescription, validatedURL) => {
			console.error("[window-loader] Failed to load URL:", validatedURL);
			console.error("[window-loader] Error code:", errorCode);
			console.error("[window-loader] Error description:", errorDescription);
		},
	);
}
