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

// Canonical wordmark per projects/vecreal/drafts/brand-atoms/assets/wordmark.svg
// (text-as-paths from real Inter Semibold; operator-tuned 2026-05-04).
// V height matches lowercase x-height; V tip at baseline; dot at half-revert position.
// Color: V + dot use --clay-light (light) / --clay-bright (dark theme via CSS class).
// Text: --text-primary (light) / --text-dark-primary (dark).
function VecrealWordmark({
	className = "",
	width = 88,
}: {
	className?: string;
	width?: number;
}) {
	return (
		<svg
			role="img"
			aria-label="Vecreal"
			viewBox="-50 -1600 7296 1700"
			preserveAspectRatio="xMidYMid meet"
			width={width}
			height={width / (7296 / 1700)}
			className={`vecreal-wordmark ${className}`.trim()}
			style={{ display: "inline-block", verticalAlign: "middle" }}
		>
			<style>{`
				.vecreal-wordmark .bk-v { fill: var(--clay-bright); }
				.vecreal-wordmark .bk-text { fill: var(--text-dark-primary); }
				.vecreal-wordmark .bk-dot { fill: var(--clay-bright); }
			`}</style>
			{/* V path (from reference-design-system.html bk-v) */}
			<path
				className="bk-v"
				d="M5 8 L26 44 Q27 46 28 44 L49 8 L37 8 L27 26 L17 8 Z"
				transform="scale(30.2162 30.2162) translate(-5 -45)"
			/>
			{/* "ecreal" letters from Inter Semibold (text-as-paths) */}
			<g className="bk-text" transform="translate(1186 0) scale(1 -1)">
				<path d="M632 -23Q463 -23 341.5 48.0Q220 119 154.5 248.0Q89 377 89 552Q89 724 153.5 854.5Q218 985 336.5 1058.5Q455 1132 615 1132Q751 1132 867.5 1072.5Q984 1013 1055.0 888.5Q1126 764 1126 568V486H348Q353 337 431.5 259.0Q510 181 635 181Q721 181 782.5 218.0Q844 255 870 326L1109 277Q1069 142 943.5 59.5Q818 -23 632 -23ZM349 663H873Q861 783 796.5 855.5Q732 928 616 928Q497 928 427.5 851.5Q358 775 349 663Z" />
			</g>
			<g className="bk-text" transform="translate(2294 0) scale(1 -1)">
				<path d="M623 -23Q460 -23 340.0 49.5Q220 122 154.5 251.5Q89 381 89 553Q89 727 154.5 857.5Q220 988 340.0 1060.0Q460 1132 623 1132Q810 1132 939.5 1038.5Q1069 945 1105 781L862 730Q841 817 780.0 869.0Q719 921 625 921Q489 921 421.5 816.0Q354 711 354 554Q354 451 384.0 368.0Q414 285 474.0 236.5Q534 188 625 188Q721 188 782.5 242.5Q844 297 865 387L1108 336Q1072 169 942.0 73.0Q812 -23 623 -23Z" />
			</g>
			<g className="bk-text" transform="translate(3385 0) scale(1 -1)">
				<path d="M138 0V1118H390V931H402Q432 1028 507.0 1080.5Q582 1133 678 1133Q728 1133 773 1126V887Q757 891 721.0 895.5Q685 900 650 900Q541 900 469.5 832.5Q398 765 398 658V0Z" />
			</g>
			<g className="bk-text" transform="translate(4096 0) scale(1 -1)">
				<path d="M632 -23Q463 -23 341.5 48.0Q220 119 154.5 248.0Q89 377 89 552Q89 724 153.5 854.5Q218 985 336.5 1058.5Q455 1132 615 1132Q751 1132 867.5 1072.5Q984 1013 1055.0 888.5Q1126 764 1126 568V486H348Q353 337 431.5 259.0Q510 181 635 181Q721 181 782.5 218.0Q844 255 870 326L1109 277Q1069 142 943.5 59.5Q818 -23 632 -23ZM349 663H873Q861 783 796.5 855.5Q732 928 616 928Q497 928 427.5 851.5Q358 775 349 663Z" />
			</g>
			<g className="bk-text" transform="translate(5205 0) scale(1 -1)">
				<path d="M450 -23Q344 -23 259.0 15.5Q174 54 125.0 129.0Q76 204 76 314Q76 440 137.5 509.5Q199 579 296.5 610.5Q394 642 502 653Q648 669 713.0 682.5Q778 696 778 754V759Q778 841 728.0 886.5Q678 932 583 932Q485 932 427.0 889.0Q369 846 349 791L108 840Q157 988 285.5 1060.0Q414 1132 582 1132Q661 1132 741.5 1113.5Q822 1095 889.0 1051.5Q956 1008 997.0 933.5Q1038 859 1038 747V0H789V154H779Q742 82 661.0 29.5Q580 -23 450 -23ZM517 170Q637 170 708.5 239.0Q780 308 780 401V533Q762 519 716.0 508.5Q670 498 618.5 490.5Q567 483 533 478Q445 466 386.5 430.0Q328 394 328 317Q328 245 381.0 207.5Q434 170 517 170Z" />
			</g>
			<g className="bk-text" transform="translate(6280 0) scale(1 -1)">
				<path d="M398 1490V0H138V1490Z" />
			</g>
			{/* Trailing dot */}
			<circle className="bk-dot" cx="7011" cy="-184" r="184" />
		</svg>
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
					<div style={{ paddingLeft: "var(--sp-6)" }}>
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
