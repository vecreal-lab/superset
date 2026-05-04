import { useEffect, type ReactNode } from "react";
import { Maximize2, Minus, X } from "lucide-react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ThemeProvider } from "../ThemeProvider";
import { PrimitiveIcon } from "../factory-primitives/common";

export interface FactoryShellProps {
	children: ReactNode;
	topBar?: ReactNode;
	sidebar?: ReactNode;
	statusStrip?: ReactNode;
}

function VecrealWordmark() {
	return (
		<span
			aria-label="Vecreal"
			style={{
				display: "inline-flex",
				alignItems: "baseline",
				gap: "var(--sp-1)",
				color: "var(--text-primary)",
				fontWeight: 600,
				letterSpacing: 0,
			}}
		>
			<svg
				viewBox="10 14 44 38"
				fill="none"
				width="16"
				height="16"
				aria-hidden="true"
			>
				<path
					d="M10 14 L31 50 Q32 52 33 50 L54 14 L42 14 L32 32 L22 14 Z"
					fill="currentColor"
				/>
			</svg>
			<span>Vecreal</span>
			<span style={{ color: "var(--accent)" }}>.</span>
		</span>
	);
}

export function FactoryShell({
	children,
	topBar,
	sidebar,
	statusStrip,
}: FactoryShellProps) {
	const minimize = electronTrpc.window.minimize.useMutation();
	const maximize = electronTrpc.window.maximize.useMutation();
	const close = electronTrpc.window.close.useMutation();

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			const command = event.ctrlKey || event.metaKey;
			if (command && event.key.toLowerCase() === "w") {
				event.preventDefault();
				close.mutate();
			}
			if (command && event.key.toLowerCase() === "m") {
				event.preventDefault();
				minimize.mutate();
			}
			if (event.key === "F11") {
				event.preventDefault();
				if (document.fullscreenElement) {
					void document.exitFullscreen();
				} else {
					void document.documentElement.requestFullscreen();
				}
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [close, minimize]);

	return (
		<ThemeProvider>
			<div
				style={{
					display: "grid",
					gridTemplateRows:
						"var(--factory-titlebar-height) var(--factory-topbar-height) minmax(0, 1fr) var(--factory-status-strip-height)",
					width: "100vw",
					height: "100vh",
					overflow: "hidden",
				}}
			>
				<header className="factory-titlebar" aria-label="Application title bar">
					<div style={{ paddingLeft: "var(--sp-8)" }}>
						<VecrealWordmark />
					</div>
					<div style={{ flex: 1, height: "100%" }} aria-hidden="true" />
					<div
						className="factory-titlebar-actions factory-no-drag"
						style={{ display: "flex", gap: "var(--sp-3)", paddingRight: "var(--sp-6)" }}
					>
						<button
							type="button"
							className="factory-icon-button"
							aria-label="Minimize window"
							onClick={() => minimize.mutate()}
						>
							<PrimitiveIcon icon={Minus} />
						</button>
						<button
							type="button"
							className="factory-icon-button"
							aria-label="Maximize window"
							onClick={() => maximize.mutate()}
						>
							<PrimitiveIcon icon={Maximize2} />
						</button>
						<button
							type="button"
							className="factory-icon-button"
							aria-label="Close window"
							onClick={() => close.mutate()}
						>
							<PrimitiveIcon icon={X} />
						</button>
					</div>
				</header>
				{topBar}
				<div
					style={{
						display: "grid",
						gridTemplateColumns: sidebar
							? "var(--factory-sidebar-width) minmax(0, 1fr)"
							: "minmax(0, 1fr)",
						minHeight: 0,
					}}
				>
					{sidebar}
					<main style={{ minWidth: 0, minHeight: 0 }}>{children}</main>
				</div>
				{statusStrip}
			</div>
		</ThemeProvider>
	);
}
