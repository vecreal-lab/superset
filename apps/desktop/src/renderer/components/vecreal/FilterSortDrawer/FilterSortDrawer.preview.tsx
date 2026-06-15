import { FilterSortDrawer } from "./FilterSortDrawer";

export function FilterSortDrawerPreview() {
	return (
		<div style={{ display: "grid", gap: "var(--sp-6)", padding: "var(--sp-8)", background: "var(--bg-app)", color: "var(--text-primary)" }}>
			<FilterSortDrawer appliedFilters={["Open", "Needs review"]}>Filter body</FilterSortDrawer>
		</div>
	);
}

export default FilterSortDrawerPreview;
