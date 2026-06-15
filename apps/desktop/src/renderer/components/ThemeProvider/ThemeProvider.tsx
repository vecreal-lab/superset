import { useInsertionEffect, type ReactNode } from "react";
import type { FactoryThemeMode } from "lib/stores/workspace";
import designTokensSource from "../../../../../../../../projects/vecreal/drafts/brand-atoms/design-tokens.json";

const FACTORY_THEME_STYLE_ID = "factory-brand-atom-theme";

type TokenEntry = {
	cssVariable?: string;
	value?: string;
};

type DesignTokensSource = {
	lockedRootVariables: TokenEntry[];
	typography: Record<string, TokenEntry | undefined>;
};

const designTokens = designTokensSource as DesignTokensSource;

const typographyTokenAliases = [
	{ sourceKey: "font-sans", cssVariable: "--font-ui" },
	{ sourceKey: "font-mono", cssVariable: "--font-mono" },
] as const;

/*
Brand atom mapping:
- lockedRootVariables entries inject their own cssVariable names directly.
- typography font rows bridge to the factory font aliases used by shell CSS.
- semantic aliases below only point at variables injected from the JSON source.
*/
function collectBrandTokenValues(): Record<string, string> {
	const values: Record<string, string> = {};

	for (const token of designTokens.lockedRootVariables) {
		if (token.cssVariable && token.value) {
			values[token.cssVariable] = token.value;
		}
	}

	for (const { sourceKey, cssVariable } of typographyTokenAliases) {
		const token = designTokens.typography[sourceKey];
		if (token?.value) {
			values[cssVariable] = token.value;
		}
	}

	return values;
}

const baseTokenValues: Record<string, string> = {
	...collectBrandTokenValues(),
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
	"--button-secondary-bg": "var(--bg-card)",
	"--button-ghost-bg": "var(--bg-app)",
	"--button-ghost-border": "var(--bg-app)",
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
	"--button-secondary-bg": "var(--bg-card)",
	"--button-ghost-bg": "var(--bg-app)",
	"--button-ghost-border": "var(--bg-app)",
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
.factory-button:active,
.factory-icon-button:active,
.factory-project-switcher:active,
.factory-profile-chip:active {
	border-color: var(--accent);
	color: var(--text-primary);
	transform: translateY(1px);
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
	background: var(--button-ghost-bg);
	border-color: var(--button-ghost-border);
	color: var(--text-secondary);
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
