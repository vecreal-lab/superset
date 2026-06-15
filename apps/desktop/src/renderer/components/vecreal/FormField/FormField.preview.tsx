import { FormField } from "./FormField";

export function FormFieldPreview() {
	return (
		<div style={{ display: "grid", gap: "var(--sp-6)", padding: "var(--sp-8)", background: "var(--bg-app)", color: "var(--text-primary)" }}>
			<FormField id="project" label="Project" kind="select" options={[{ value: "sf", label: "Software Factory" }]} description="Choose a workspace." />
		</div>
	);
}

export default FormFieldPreview;
