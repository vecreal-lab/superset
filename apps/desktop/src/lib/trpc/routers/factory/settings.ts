import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { findFactoryRoot } from "main/lib/coordinator/prompt-loader";
import { publicProcedure, router } from "lib/trpc";

const themeSchema = z.enum(["light", "dark"]);

function getBunVersion() {
	return (globalThis as { Bun?: { version?: string } }).Bun?.version ?? "unavailable";
}

async function getDesktopPackage(root: string) {
	const packagePath = path.join(root, "vendor", "superset-sh", "apps", "desktop", "package.json");
	const raw = await readFile(packagePath, "utf8").catch(() => "{}");
	return JSON.parse(raw) as { version?: string; name?: string };
}

async function runCommand(input: {
	command: string;
	args: string[];
	cwd: string;
	env?: NodeJS.ProcessEnv;
	timeoutMs?: number;
}) {
	return new Promise<{
		exitCode: number | null;
		stdout: string;
		stderr: string;
		timedOut: boolean;
	}>((resolve) => {
		const child = spawn(input.command, input.args, {
			cwd: input.cwd,
			env: { ...process.env, ...input.env },
			windowsHide: true,
		});
		let stdout = "";
		let stderr = "";
		let settled = false;
		const timeout = setTimeout(() => {
			settled = true;
			child.kill();
			resolve({ exitCode: null, stdout, stderr, timedOut: true });
		}, input.timeoutMs ?? 180_000);

		child.stdout.on("data", (chunk) => {
			stdout += String(chunk);
		});
		child.stderr.on("data", (chunk) => {
			stderr += String(chunk);
		});
		child.on("error", (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			resolve({ exitCode: null, stdout, stderr: `${stderr}\n${error.message}`.trim(), timedOut: false });
		});
		child.on("close", (exitCode) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			resolve({ exitCode, stdout, stderr, timedOut: false });
		});
	});
}

export const createFactorySettingsRouter = () =>
	router({
		getOperatorProfile: publicProcedure.query(() => ({
			name: process.env.FACTORY_OPERATOR_NAME || "Yuriy Levy",
			role: process.env.FACTORY_OPERATOR_ROLE || "Operator",
			isLocalOperator: true,
		})),
		getDiagnostics: publicProcedure.query(async () => {
			const root = findFactoryRoot();
			const packageJson = await getDesktopPackage(root);
			return {
				version: packageJson.version || "0.0.0",
				appName: packageJson.name || "desktop",
				factoryRoot: root,
				factoryLocalOnly: process.env.FACTORY_LOCAL_ONLY !== "0",
				electronVersion: process.versions.electron || "unavailable",
				chromeVersion: process.versions.chrome || "unavailable",
				nodeVersion: process.versions.node,
				bunVersion: getBunVersion(),
				platform: process.platform,
				arch: process.arch,
			};
		}),
		toggleTheme: publicProcedure
			.input(z.object({ theme: themeSchema }))
			.mutation(({ input }) => ({ theme: input.theme })),
		runBootSmoke: publicProcedure.mutation(async () => {
			const root = findFactoryRoot();
			const desktopRoot = path.join(root, "vendor", "superset-sh", "apps", "desktop");
			const outputDir = path.join(root, "runs", "wo-c26.8-pre-graduation-fixes", "settings-boot-smoke");
			const result = await runCommand({
				command: "bun",
				args: ["run", "test:cockpit-boot"],
				cwd: desktopRoot,
				env: {
					COCKPIT_BOOT_OUTPUT_DIR: outputDir,
					COCKPIT_BOOT_ALLOW_EXISTING_APP: "1",
				},
				timeoutMs: 240_000,
			});
			return {
				status: result.exitCode === 0 ? "pass" : "fail",
				exitCode: result.exitCode,
				timedOut: result.timedOut,
				resultsPath: path.join(outputDir, "results.json"),
				stdout: result.stdout.slice(-8_000),
				stderr: result.stderr.slice(-8_000),
			};
		}),
	});
