import { existsSync } from "node:fs";
import path from "node:path";

export function findFactoryRoot(): string {
	const explicit =
		process.env.SOFTWARE_FACTORY_ROOT || process.env.FACTORY_ROOT || "";
	const candidates = [
		explicit,
		process.cwd(),
		path.resolve(process.cwd(), ".."),
		path.resolve(process.cwd(), "..", ".."),
		path.resolve(process.cwd(), "..", "..", ".."),
		path.resolve(process.cwd(), "..", "..", "..", ".."),
	].filter(Boolean);

	for (const candidate of candidates) {
		let current = path.resolve(candidate);
		while (true) {
			if (
				existsSync(path.join(current, "work-orders")) &&
				existsSync(path.join(current, "projects", "software-factory"))
			) {
				return current;
			}
			const next = path.dirname(current);
			if (next === current) break;
			current = next;
		}
	}

	return path.resolve(process.cwd(), "..", "..");
}
