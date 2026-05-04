import { useInsertionEffect, type ReactNode } from "react";
import type { FactoryThemeMode } from "lib/stores/workspace";

const FACTORY_THEME_STYLE_ID = "factory-brand-atom-theme";

const baseTokenValues: Record<string, string> = {
	"--font-ui": '"Inter", system-ui, sans-serif',
	"--font-mono": '"JetBrains Mono", ui-monospace, monospace',
	"--bg-app-light": "#FAFAF8",
	"--bg-card-light": "#FFFFFF",
	"--bg-card-light-bottom": "#FBFAF7",
	"--bg-soft-light": "#F4F4F1",
	"--bg-hover-light": "#EFEFEC",
	"--border-light": "#E8E6E0",
	"--border-light-subtle": "#F0EEE8",
	"--border-light-strong": "#D6D3CB",
	"--bg-sidebar-dark": "#0a0b0d",
	"--bg-app-dark": "#131517",
	"--bg-card-dark-top": "#21242a",
	"--bg-card-dark-bottom": "#1c1e23",
	"--bg-pill-dark": "#1f2126",
	"--bg-cta-dark": "#1F1D1A",
	"--border-dark": "#2d2f36",
	"--border-dark-subtle": "#1d1f24",
	"--text-light-primary": "#1F1D1A",
	"--text-light-secondary": "#5A5550",
	"--text-light-tertiary": "#918A82",
	"--text-light-disabled": "#B8B2A8",
	"--text-dark-primary": "#f7f8f8",
	"--text-dark-body": "#d0d6e0",
	"--text-dark-muted": "#9097a1",
	"--text-dark-tertiary": "#62666d",
	"--text-dark-disabled": "#5a5e66",
	"--clay-light": "#A05847",
	"--clay-bright": "#C68070",
	"--clay": "#7A3D32",
	"--clay-dark": "#5C2D26",
	"--success": "#5DA17D",
	"--success-dark": "#4A8A68",
	"--warning-light": "#A87A2E",
	"--warning-dark": "#D4A960",
	"--error": "#C95151",
	"--error-dark": "#B53D3D",
	"--info": "#5A6878",
	"--sp-0": "0",
	"--sp-1": "2px",
	"--sp-2": "4px",
	"--sp-3": "6px",
	"--sp-4": "8px",
	"--sp-5": "10px",
	"--sp-6": "12px",
	"--sp-7": "14px",
	"--sp-8": "16px",
	"--sp-9": "20px",
	"--sp-10": "24px",
	"--sp-11": "32px",
	"--sp-12": "40px",
	"--sp-13": "56px",
	"--sp-14": "80px",
	"--r-1": "3px",
	"--r-2": "4px",
	"--r-3": "5px",
	"--r-4": "6px",
	"--r-5": "7px",
	"--r-6": "8px",
	"--r-7": "10px",
	"--r-full": "999px",
	"--motion-instant": "0ms",
	"--motion-fast": "120ms",
	"--motion-medium": "180ms",
	"--motion-slow": "240ms",
	"--motion-page": "320ms",
	"--ease-out": "cubic-bezier(0.2, 0.8, 0.2, 1)",
	"--ease-in": "cubic-bezier(0.4, 0, 0.6, 0.4)",
	"--ease-in-out": "cubic-bezier(0.4, 0, 0.2, 1)",
	"--ease-spring": "cubic-bezier(0.16, 1, 0.3, 1)",
	"--shadow-card-dark":
		"0 1px 0 rgb(255 255 255 / 0.05) inset, 0 1px 4px rgb(0 0 0 / 0.4)",
	"--shadow-card-light":
		"0 1px 0 rgb(255 255 255 / 0.6) inset, 0 1px 3px rgb(31 29 26 / 0.05)",
	"--shadow-modal-dark":
		"0 1px 0 rgb(255 255 255 / 0.06) inset, 0 16px 48px rgb(0 0 0 / 0.6)",
	"--shadow-modal-light":
		"0 1px 0 rgb(255 255 255 / 0.7) inset, 0 16px 48px rgb(31 29 26 / 0.18)",
	"--focus-ring": "0 0 0 3px rgb(160 88 71 / 0.5)",
	"--focus-ring-soft": "0 0 0 3px rgb(160 88 71 / 0.18)",
	"--factory-border-width": "1px",
	"--factory-control-height": "32px",
	"--factory-composer-height": "56px",
	"--factory-titlebar-height": "34px",
	"--factory-topbar-height": "48px",
	"--factory-status-strip-height": "26px",
	"--factory-sidebar-width": "208px",
	"--factory-right-rail-min": "240px",
	"--factory-right-rail-default": "360px",
	"--factory-right-rail-max": "480px",
};

const darkSemanticTokenValues: Record<string, string> = {
	"--bg-app": "var(--bg-app-dark)",
	"--bg-card": "var(--bg-card-dark-top)",
	"--bg-card-bottom": "var(--bg-card-dark-bottom)",
	"--bg-soft": "var(--bg-pill-dark)",
	"--bg-hover": "var(--bg-card-dark-bottom)",
	"--border": "var(--border-dark)",
	"--border-subtle": "var(--border-dark-subtle)",
	"--text-primary": "var(--text-dark-primary)",
	"--text-secondary": "var(--text-dark-body)",
	"--text-tertiary": "var(--text-dark-muted)",
	"--text-disabled": "var(--text-dark-disabled)",
	"--accent": "var(--clay-bright)",
	"--accent-strong": "var(--clay-light)",
	"--warning": "var(--warning-dark)",
	"--shadow-card": "var(--shadow-card-dark)",
	"--shadow-modal": "var(--shadow-modal-dark)",
	"--button-primary-bg": "var(--bg-cta-dark)",
	"--button-primary-fg": "var(--text-dark-primary)",
	"--button-secondary-bg": "transparent",
	"--button-disabled-bg": "var(--bg-soft)",
	"--button-disabled-fg": "var(--text-disabled)",
};

const lightSemanticTokenValues: Record<string, string> = {
	"--bg-app": "var(--bg-app-light)",
	"--bg-card": "var(--bg-card-light)",
	"--bg-card-bottom": "var(--bg-card-light-bottom)",
	"--bg-soft": "var(--bg-soft-light)",
	"--bg-hover": "var(--bg-hover-light)",
	"--border": "var(--border-light)",
	"--border-subtle": "var(--border-light-subtle)",
	"--text-primary": "var(--text-light-primary)",
	"--text-secondary": "var(--text-light-secondary)",
	"--text-tertiary": "var(--text-light-tertiary)",
	"--text-disabled": "var(--text-light-disabled)",
	"--accent": "var(--clay-light)",
	"--accent-strong": "var(--clay)",
	"--warning": "var(--warning-light)",
	"--shadow-card": "var(--shadow-card-light)",
	"--shadow-modal": "var(--shadow-modal-light)",
	"--button-primary-bg": "var(--text-light-primary)",
	"--button-primary-fg": "var(--text-dark-primary)",
	"--button-secondary-bg": "transparent",
	"--button-disabled-bg": "var(--bg-soft-light)",
	"--button-disabled-fg": "var(--text-light-disabled)",
};

const factoryCss = `
.factory-token-scope {
	font-family: var(--font-ui);
	background: var(--bg-app);
	color: var(--text-primary);
}
.factory-titlebar {
	display: flex;
	align-items: center;
	gap: var(--sp-8);
	height: var(--factory-titlebar-height);
	border-bottom: var(--factory-border-width) solid var(--border-subtle);
	background: var(--bg-app);
	-webkit-app-region: drag;
}
.factory-titlebar-actions,
.factory-no-drag,
.factory-rail-resize-handle {
	-webkit-app-region: no-drag;
}
.factory-button,
.factory-icon-button,
.factory-project-switcher,
.factory-profile-chip {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: var(--sp-4);
	height: var(--factory-control-height);
	min-width: var(--factory-control-height);
	padding: 0 var(--sp-7);
	border: var(--factory-border-width) solid var(--border);
	border-radius: var(--r-3);
	background: var(--button-secondary-bg);
	color: var(--text-secondary);
	font: inherit;
	transition:
		background var(--motion-fast) var(--ease-out),
		border-color var(--motion-fast) var(--ease-out),
		color var(--motion-fast) var(--ease-out);
}
.factory-button:hover,
.factory-icon-button:hover,
.factory-project-switcher:hover,
.factory-profile-chip:hover {
	background: var(--bg-hover);
	color: var(--text-primary);
}
.factory-button:focus-visible,
.factory-icon-button:focus-visible,
.factory-project-switcher:focus-visible,
.factory-profile-chip:focus-visible,
.factory-rail-resize-handle:focus-visible,
.factory-entity-mention:focus-visible {
	outline: none;
	box-shadow: var(--focus-ring);
}
.factory-button--primary {
	background: var(--button-primary-bg);
	color: var(--button-primary-fg);
	border-color: var(--button-primary-bg);
}
.factory-button--secondary {
	background: var(--button-secondary-bg);
	color: var(--text-primary);
}
.factory-button--ghost {
	background: transparent;
	border-color: transparent;
	color: var(--text-secondary);
}
.factory-button--clay {
	background: var(--accent-strong);
	color: var(--text-dark-primary);
	border-color: var(--accent-strong);
}
.factory-button:disabled,
.factory-icon-button:disabled {
	background: var(--button-disabled-bg);
	color: var(--button-disabled-fg);
	cursor: not-allowed;
}
.factory-card {
	border: var(--factory-border-width) solid var(--border);
	border-radius: var(--r-6);
	background: var(--bg-card);
	box-shadow: var(--shadow-card);
}
.factory-chip,
.factory-badge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: var(--sp-2);
	border: var(--factory-border-width) solid var(--border);
	border-radius: var(--r-full);
	background: var(--bg-soft);
	color: var(--text-secondary);
	font-family: var(--font-mono);
}
.factory-badge--attention,
.factory-chip--attention {
	border-color: var(--accent);
	color: var(--accent);
}
.factory-entity-mention {
	color: var(--accent);
	text-decoration: underline;
	text-underline-offset: var(--sp-2);
}
.factory-rail-resize-handle {
	position: absolute;
	left: 0;
	top: 0;
	width: var(--sp-2);
	height: 100%;
	cursor: col-resize;
	background: var(--accent);
	opacity: 0;
	transition: opacity var(--motion-fast) var(--ease-out);
}
.factory-rail-resize-handle:hover,
.factory-rail-resize-handle[data-active="true"] {
	opacity: 1;
}
@media (prefers-reduced-motion: reduce) {
	.factory-button,
	.factory-icon-button,
	.factory-project-switcher,
	.factory-profile-chip,
	.factory-rail-resize-handle {
		transition-duration: var(--motion-instant);
	}
}
`;

function resolveThemeMode(themeMode: FactoryThemeMode): "dark" | "light" {
	if (themeMode === "dark" || themeMode === "light") return themeMode;
	if (typeof window === "undefined" || !window.matchMedia) return "dark";
	return window.matchMedia("(prefers-color-scheme: light)").matches
		? "light"
		: "dark";
}

function applyThemeTokens(themeMode: FactoryThemeMode) {
	if (typeof document === "undefined") return;
	const root = document.documentElement;
	const resolvedTheme = resolveThemeMode(themeMode);
	const semanticTokens =
		resolvedTheme === "light" ? lightSemanticTokenValues : darkSemanticTokenValues;

	for (const [token, value] of Object.entries(baseTokenValues)) {
		root.style.setProperty(token, value);
	}
	for (const [token, value] of Object.entries(semanticTokens)) {
		root.style.setProperty(token, value);
	}

	root.dataset.theme = resolvedTheme;
	root.style.colorScheme = resolvedTheme;
}

function ensureFactoryStylesheet() {
	if (typeof document === "undefined") return;
	if (document.getElementById(FACTORY_THEME_STYLE_ID)) return;
	const style = document.createElement("style");
	style.id = FACTORY_THEME_STYLE_ID;
	style.textContent = factoryCss;
	document.head.appendChild(style);

	const fontLinkId = "factory-brand-fonts";
	if (!document.getElementById(fontLinkId)) {
		const link = document.createElement("link");
		link.id = fontLinkId;
		link.rel = "stylesheet";
		link.href =
			"https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap";
		document.head.appendChild(link);
	}
}

export function ThemeProvider({
	children,
	themeMode = "dark",
}: {
	children: ReactNode;
	themeMode?: FactoryThemeMode;
}) {
	useInsertionEffect(() => {
		ensureFactoryStylesheet();
		applyThemeTokens(themeMode);
	}, [themeMode]);

	return <div className="factory-token-scope">{children}</div>;
}
