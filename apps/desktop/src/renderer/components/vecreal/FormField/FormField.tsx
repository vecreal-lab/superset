import type { CSSProperties } from "react";
import type { ReactNode } from "react";
import * as Checkbox from "@radix-ui/react-checkbox";
import * as Label from "@radix-ui/react-label";
import * as RadioGroup from "@radix-ui/react-radio-group";
import * as Select from "@radix-ui/react-select";
import { buttonBase, mergeStyle, overlaySurface, r, s, textBase, v } from "../componentInternals";

export interface FormOption {
	value: string;
	label: string;
	disabled?: boolean;
}

export interface FormFieldProps {
	id: string;
	label: string;
	kind?: "input" | "textarea" | "select" | "checkbox" | "radio";
	description?: string;
	error?: string;
	required?: boolean;
	disabled?: boolean;
	options?: FormOption[];
}

const inputStyle: CSSProperties = {
	...textBase,
	minHeight: s.px11,
	paddingInline: s.px7,
	border: `${v.borderWidth} solid ${v.border}`,
	borderRadius: r.sm,
	background: v.bg,
	color: v.text,
};

export function FormField({
	id,
	label,
	kind = "input",
	description,
	error,
	required,
	disabled,
	options = [],
}: FormFieldProps) {
	const descriptionId = description ? `${id}-description` : undefined;
	const errorId = error ? `${id}-error` : undefined;
	const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;
	const labelNode = (
		<Label.Root htmlFor={id} style={{ ...textBase, fontSize: s.px7, fontWeight: 600 }}>
			{label}{required ? " *" : ""}
		</Label.Root>
	);
	const help = (
		<>
			{description ? <p id={descriptionId} style={{ margin: 0, color: v.muted, fontSize: s.px6 }}>{description}</p> : null}
			{error ? <p id={errorId} role="alert" style={{ margin: 0, color: v.error, fontSize: s.px6 }}>{error}</p> : null}
		</>
	);

	let control: ReactNode;
	if (kind === "textarea") {
		control = <textarea id={id} aria-describedby={describedBy} required={required} disabled={disabled} style={mergeStyle(inputStyle, { minHeight: "calc(var(--sp-14) + var(--sp-10))", paddingBlock: s.px6 })} />;
	} else if (kind === "select") {
		control = (
			<Select.Root disabled={disabled}>
				<Select.Trigger id={id} aria-describedby={describedBy} style={inputStyle}>
					<Select.Value placeholder="Choose an option" />
				</Select.Trigger>
				<Select.Portal>
					<Select.Content style={overlaySurface}>
						<Select.Viewport>
							{options.map((option) => (
								<Select.Item key={option.value} value={option.value} disabled={option.disabled} style={mergeStyle(buttonBase, { justifyContent: "flex-start", background: "transparent", borderColor: "transparent" })}>
									<Select.ItemText>{option.label}</Select.ItemText>
								</Select.Item>
							))}
						</Select.Viewport>
					</Select.Content>
				</Select.Portal>
			</Select.Root>
		);
	} else if (kind === "checkbox") {
		control = (
			<div style={{ display: "flex", alignItems: "center", gap: s.px4 }}>
				<Checkbox.Root id={id} aria-describedby={describedBy} required={required} disabled={disabled} style={mergeStyle(buttonBase, { width: s.px9, height: s.px9, minHeight: s.px9, padding: 0 })}>
					<Checkbox.Indicator>check</Checkbox.Indicator>
				</Checkbox.Root>
				{labelNode}
			</div>
		);
		return <div data-vecreal-component="FormField" data-kind={kind} data-headless-layer="@radix-ui/react-checkbox @radix-ui/react-label" style={{ display: "grid", gap: s.px3 }}>{control}{help}</div>;
	} else if (kind === "radio") {
		control = (
			<RadioGroup.Root aria-describedby={describedBy} disabled={disabled} style={{ display: "grid", gap: s.px3 }}>
				{options.map((option) => (
					<div key={option.value} style={{ display: "flex", alignItems: "center", gap: s.px4 }}>
						<RadioGroup.Item id={`${id}-${option.value}`} value={option.value} disabled={option.disabled} style={mergeStyle(buttonBase, { width: s.px9, height: s.px9, minHeight: s.px9, padding: 0, borderRadius: r.pill })}>
							<RadioGroup.Indicator>on</RadioGroup.Indicator>
						</RadioGroup.Item>
						<Label.Root htmlFor={`${id}-${option.value}`} style={{ ...textBase, fontSize: s.px7 }}>{option.label}</Label.Root>
					</div>
				))}
			</RadioGroup.Root>
		);
	} else {
		control = <input id={id} aria-describedby={describedBy} required={required} disabled={disabled} style={inputStyle} />;
	}

	return (
		<div data-vecreal-component="FormField" data-kind={kind} data-headless-layer="@radix-ui/react-select @radix-ui/react-radio-group @radix-ui/react-label" style={{ display: "grid", gap: s.px3 }}>
			{labelNode}
			{control}
			{help}
		</div>
	);
}
