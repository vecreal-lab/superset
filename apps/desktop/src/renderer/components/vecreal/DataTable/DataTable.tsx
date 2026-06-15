import type { ReactNode } from "react";
import { useMemo } from "react";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { s, textBase, v } from "../componentInternals";

export interface DataTableColumn<TData> {
	id: string;
	header: ReactNode;
	accessorKey: keyof TData & string;
}

export interface DataTableProps<TData extends Record<string, unknown>> {
	data: TData[];
	columns: Array<DataTableColumn<TData>>;
	label?: string;
	emptyMessage?: string;
}

export function DataTable<TData extends Record<string, unknown>>({
	data,
	columns,
	label = "Data table",
	emptyMessage = "No rows yet.",
}: DataTableProps<TData>) {
	const tableColumns = useMemo<Array<ColumnDef<TData>>>(() => columns.map((column) => ({
		id: column.id,
		header: () => column.header,
		accessorKey: column.accessorKey,
	})), [columns]);
	const table = useReactTable({ data, columns: tableColumns, getCoreRowModel: getCoreRowModel() });
	return (
		<table aria-label={label} data-vecreal-component="DataTable" data-headless-layer="@tanstack/react-table" style={{ ...textBase, width: "100%", borderCollapse: "collapse", fontSize: s.px7 }}>
			<thead>
				{table.getHeaderGroups().map((group) => (
					<tr key={group.id}>
						{group.headers.map((header) => (
							<th key={header.id} scope="col" style={{ padding: s.px5, textAlign: "left", color: v.muted, borderBottom: `${v.borderWidth} solid ${v.border}` }}>
								{flexRender(header.column.columnDef.header, header.getContext())}
							</th>
						))}
					</tr>
				))}
			</thead>
			<tbody>
				{table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => (
					<tr key={row.id}>
						{row.getVisibleCells().map((cell) => (
							<td key={cell.id} style={{ padding: s.px5, borderBottom: `${v.borderWidth} solid ${v.border}`, color: v.body }}>
								{flexRender(cell.column.columnDef.cell, cell.getContext())}
							</td>
						))}
					</tr>
				)) : (
					<tr>
						<td colSpan={columns.length} style={{ padding: s.px8, color: v.muted }}>{emptyMessage}</td>
					</tr>
				)}
			</tbody>
		</table>
	);
}
