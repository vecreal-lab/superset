import { SearchInput } from "./SearchInput";

export function SearchInputPreview() {
	return (
		<div style={{ display: "grid", gap: "var(--sp-6)", padding: "var(--sp-8)", background: "var(--bg-app)", color: "var(--text-primary)" }}>
			<SearchInput label="Find work" results={[{ id: "r1", label: "WO-CL.4", description: "Component batch" }]} />
		</div>
	);
}

export default SearchInputPreview;
