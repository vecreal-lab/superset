import { cn } from "@superset/ui/utils";

interface SupersetLogoProps {
	className?: string;
}

export function SupersetLogo({ className }: SupersetLogoProps) {
	return (
		<svg
			width="320"
			height="46"
			viewBox="0 0 320 46"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={cn("text-foreground", className)}
			aria-label="Software Factory"
		>
			<title>Software Factory</title>
			<rect
				x="1"
				y="1"
				width="44"
				height="44"
				rx="8"
				stroke="currentColor"
				strokeWidth="2"
				opacity="0.72"
			/>
			<rect x="10" y="10" width="10" height="10" rx="2" fill="currentColor" />
			<rect x="26" y="10" width="10" height="10" rx="2" fill="currentColor" />
			<rect x="10" y="26" width="10" height="10" rx="2" fill="currentColor" />
			<path
				d="M27 31H36M31.5 26.5V35.5"
				stroke="currentColor"
				strokeWidth="2.4"
				strokeLinecap="round"
			/>
			<text
				x="58"
				y="29"
				fill="currentColor"
				fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
				fontSize="24"
				fontWeight="650"
				letterSpacing="0"
			>
				Software Factory
			</text>
		</svg>
	);
}
