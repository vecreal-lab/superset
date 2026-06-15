import * as Popover from "@radix-ui/react-popover";
import { EmptyState } from "../EmptyState";
import { buttonBase, mergeStyle, overlaySurface, r, s, textBase, v } from "../componentInternals";

export interface SearchInputProps {
	label: string;
	placeholder?: string;
	results?: Array<{ id: string; label: string; description?: string }>;
	value?: string;
}

export function SearchInput({ label, placeholder = "Search", results = [], value = "" }: SearchInputProps) {
	const inputId = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-search`;
	return (
		<Popover.Root open={results.length > 0}>
			<div data-vecreal-component="SearchInput" data-headless-layer="@radix-ui/react-popover" style={{ display: "grid", gap: s.px3 }}>
				<label htmlFor={inputId} style={{ ...textBase, fontSize: s.px6, color: v.muted }}>{label}</label>
				<Popover.Anchor asChild>
					<input
						id={inputId}
						type="search"
						defaultValue={value}
						placeholder={placeholder}
						style={{
							...textBase,
							minHeight: s.px11,
							paddingInline: s.px7,
							border: `${v.borderWidth} solid ${v.border}`,
							borderRadius: r.sm,
							background: v.bg,
							color: v.text,
						}}
					/>
				</Popover.Anchor>
				<Popover.Portal forceMount>
					<Popover.Content side="bottom" style={mergeStyle(overlaySurface, { padding: s.px5, width: "var(--radix-popover-trigger-width)" })}>
						{results.length ? results.map((result) => (
							<button key={result.id} type="button" style={mergeStyle(buttonBase, { justifyContent: "flex-start", background: "transparent", borderColor: "transparent", minHeight: s.px10 })}>
								<span>{result.label}</span>
								{result.description ? <span style={{ color: v.muted }}>{result.description}</span> : null}
							</button>
						)) : <EmptyState title="No results" message="Try a different term." />}
					</Popover.Content>
				</Popover.Portal>
			</div>
		</Popover.Root>
	);
}
