import { Toaster } from "@superset/ui/sonner";
import {
	AlertTriangle,
	CheckCircle2,
	Info,
	LoaderCircle,
	XCircle,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { MotionPreset } from "../MotionPreset";

export type ToastNotificationTone = "success" | "info" | "warning" | "error" | "loading";

export interface ToastNotificationProps {
	tone?: ToastNotificationTone;
	title: ReactNode;
	description?: ReactNode;
	action?: ReactNode;
}

export interface ToastNotificationViewportProps
	extends Omit<ComponentProps<typeof Toaster>, "toastOptions"> {
	toastOptions?: ComponentProps<typeof Toaster>["toastOptions"];
}

const toneIcons = {
	success: CheckCircle2,
	info: Info,
	warning: AlertTriangle,
	error: XCircle,
	loading: LoaderCircle,
} satisfies Record<ToastNotificationTone, typeof Info>;

const toneLabels = {
	success: "Success",
	info: "Information",
	warning: "Warning",
	error: "Error",
	loading: "Loading",
} satisfies Record<ToastNotificationTone, string>;

export const toastNotificationClassNames = {
	toast: "vecreal-toast-notification",
	title: "vecreal-toast-notification-title",
	description: "vecreal-toast-notification-description",
	actionButton: "vecreal-toast-notification-action",
	cancelButton: "vecreal-toast-notification-cancel",
	closeButton: "vecreal-toast-notification-close",
} as const;

export function toastNotificationAriaLive(tone: ToastNotificationTone) {
	return tone === "error" || tone === "warning" ? "assertive" : "polite";
}

function iconColorVar(tone: ToastNotificationTone) {
	if (tone === "success") return "var(--success)";
	if (tone === "warning") return "var(--warning-light)";
	if (tone === "error") return "var(--error)";
	return "var(--accent)";
}

export function ToastNotification({
	tone = "info",
	title,
	description,
	action,
}: ToastNotificationProps) {
	const Icon = toneIcons[tone];

	return (
		<MotionPreset
			preset="entry"
			role={tone === "error" ? "alert" : "status"}
			aria-live={toastNotificationAriaLive(tone)}
			style={{
				display: "grid",
				gridTemplateColumns: "auto minmax(0, 1fr) auto",
				gap: "var(--sp-4)",
				alignItems: "start",
				minWidth: "calc(var(--sp-14) * 4)",
				maxWidth: "calc(var(--sp-14) * 5)",
				padding: "var(--sp-5) var(--sp-6)",
				border: "var(--factory-border-width) solid var(--border)",
				borderRadius: "var(--r-card)",
				background: "var(--bg-card)",
				color: "var(--text-primary)",
				boxShadow: "var(--shadow-card)",
			}}
		>
			<Icon
				aria-hidden="true"
				size={16}
				style={{
					color: iconColorVar(tone),
					marginTop: "var(--sp-1)",
				}}
			/>
			<div style={{ display: "grid", gap: "var(--sp-1)", minWidth: 0 }}>
				<strong style={{ fontSize: "var(--fs-body-sm)", fontWeight: 600 }}>
					{title}
				</strong>
				{description ? (
					<p
						style={{
							margin: 0,
							color: "var(--text-secondary)",
							fontSize: "var(--fs-caption)",
							lineHeight: 1.45,
						}}
					>
						{description}
					</p>
				) : null}
			</div>
			{action ? <div>{action}</div> : null}
			<span className="sr-only">{toneLabels[tone]}</span>
		</MotionPreset>
	);
}

export function ToastNotificationViewport({
	toastOptions,
	...props
}: ToastNotificationViewportProps) {
	return (
		<MotionPreset preset="re-anchor" layout style={{ position: "relative" }}>
			<Toaster
				expand
				toastOptions={{
					...toastOptions,
					style: {
						border: "var(--factory-border-width) solid var(--border)",
						borderRadius: "var(--r-card)",
						background: "var(--bg-card)",
						color: "var(--text-primary)",
						boxShadow: "var(--shadow-card)",
						...(toastOptions?.style ?? {}),
					},
					classNames: {
						...toastNotificationClassNames,
						...(toastOptions?.classNames ?? {}),
					},
				}}
				{...props}
			/>
		</MotionPreset>
	);
}
