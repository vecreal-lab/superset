import { DataTable } from "./DataTable";

export function DataTablePreview() {
	return (
		<div style={{ display: "grid", gap: "var(--sp-6)", padding: "var(--sp-8)", background: "var(--bg-app)", color: "var(--text-primary)" }}>
			<DataTable data={[{ name: "Gate", state: "pending" }]} columns={[{ id: "name", header: "Name", accessorKey: "name" }, { id: "state", header: "State", accessorKey: "state" }]} />
		</div>
	);
}

export default DataTablePreview;
