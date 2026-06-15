import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

export interface RouteErrorBoundaryProps {
	children: ReactNode;
	routePath?: string;
	showStack?: boolean;
	onReport?: (report: RouteErrorReport) => void;
}

interface RouteErrorBoundaryState {
	error?: Error;
	errorInfo?: ErrorInfo;
}

export interface RouteErrorReport {
	routePath: string;
	message: string;
	stack?: string;
	componentStack?: string;
	reportedAt: string;
}

export function sanitizeRouteErrorMessage(error: unknown): string {
	const message =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: "This route hit an unexpected rendering error.";
	return message.replace(/\s+/g, " ").trim().slice(0, 500);
}

function routeErrorReport({
	error,
	errorInfo,
	routePath,
}: {
	error: Error;
	errorInfo?: ErrorInfo;
	routePath?: string;
}): RouteErrorReport {
	return {
		routePath: routePath || "unknown route",
		message: sanitizeRouteErrorMessage(error),
		stack: error.stack,
		componentStack: errorInfo?.componentStack ?? undefined,
		reportedAt: new Date().toISOString(),
	};
}

export function RouteErrorBoundaryFallback({
	report,
	showStack,
	onRefresh,
	onReport,
}: {
	report: RouteErrorReport;
	showStack: boolean;
	onRefresh: () => void;
	onReport: () => void;
}) {
	return (
		<main
			data-route-error-boundary="true"
			role="alert"
			aria-live="assertive"
			className="flex h-full min-h-screen w-full items-center justify-center bg-background p-6 text-foreground"
		>
			<section className="grid max-w-2xl gap-4 rounded-md border bg-card p-6 shadow-sm">
				<div className="grid gap-2">
					<p className="font-mono text-xs uppercase text-muted-foreground">
						Route error
					</p>
					<h1 className="text-xl font-semibold">This cockpit route failed to render</h1>
					<p className="text-sm text-muted-foreground">
						The app caught the error instead of leaving a blank screen.
					</p>
				</div>
				<dl className="grid gap-3 text-sm">
					<div className="grid gap-1">
						<dt className="font-medium">Route</dt>
						<dd className="font-mono text-muted-foreground">{report.routePath}</dd>
					</div>
					<div className="grid gap-1">
						<dt className="font-medium">What happened</dt>
						<dd className="text-muted-foreground">{report.message}</dd>
					</div>
				</dl>
				{showStack && report.stack ? (
					<details className="rounded-md border bg-muted/30 p-3 text-xs">
						<summary className="cursor-pointer font-medium">Developer stack</summary>
						<pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap">
							{report.stack}
							{report.componentStack ? `\n\n${report.componentStack}` : ""}
						</pre>
					</details>
				) : null}
				<div className="flex flex-wrap gap-2">
					<button type="button" className="factory-button factory-button--primary" onClick={onRefresh}>
						Refresh route
					</button>
					<button type="button" className="factory-button factory-button--ghost" onClick={onReport}>
						Report issue
					</button>
				</div>
			</section>
		</main>
	);
}

export class RouteErrorBoundary extends Component<
	RouteErrorBoundaryProps,
	RouteErrorBoundaryState
> {
	state: RouteErrorBoundaryState = {};

	static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
		return { error };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		const report = routeErrorReport({
			error,
			errorInfo,
			routePath: this.props.routePath,
		});
		console.error("[ROUTE_ERROR]", report);
		this.setState({ error, errorInfo });
	}

	private reportCurrentError = () => {
		if (!this.state.error) return;
		const report = routeErrorReport({
			error: this.state.error,
			errorInfo: this.state.errorInfo,
			routePath: this.props.routePath,
		});
		console.warn("[ROUTE_ERROR_REPORT]", report);
		this.props.onReport?.(report);
	};

	render() {
		if (!this.state.error) return this.props.children;

		const report = routeErrorReport({
			error: this.state.error,
			errorInfo: this.state.errorInfo,
			routePath: this.props.routePath,
		});
		return (
			<RouteErrorBoundaryFallback
				report={report}
				showStack={this.props.showStack ?? process.env.NODE_ENV === "development"}
				onRefresh={() => window.location.reload()}
				onReport={this.reportCurrentError}
			/>
		);
	}
}
