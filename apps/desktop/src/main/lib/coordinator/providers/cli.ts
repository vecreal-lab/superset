import {
	invokeFactoryCliRole,
	providerForRole,
	type FactoryCliProvider,
} from "main/lib/factory-cli";
import type {
	CoordinatorProvider,
	CoordinatorProviderRequest,
	CoordinatorProviderResult,
} from "../events";

export class CliCoordinatorProvider implements CoordinatorProvider {
	readonly id = "cli" as const;

	async invoke(
		input: CoordinatorProviderRequest,
	): Promise<CoordinatorProviderResult> {
		const cliProvider: FactoryCliProvider = providerForRole("PROJECT_COORDINATOR");
		const result = await invokeFactoryCliRole({
			provider: cliProvider,
			roleId: "PROJECT_COORDINATOR",
			prompt: input.prompt,
			dialogueId: input.dialogueId,
			signal: input.signal,
			onChunk: input.onChunk,
		});
		const text = result.text.trim();
		if (!text) {
			throw new Error(
				"PROJECT_COORDINATOR CLI provider returned an empty response.",
			);
		}

		return {
			text,
			provider: "cli",
			sessionId: result.sessionId,
			exitCode: result.exitCode,
		};
	}
}

export class MockCoordinatorProvider implements CoordinatorProvider {
	readonly id = "mock" as const;

	constructor(private readonly response = "Mock Project Coordinator response.") {}

	async invoke(
		input: CoordinatorProviderRequest,
	): Promise<CoordinatorProviderResult> {
		input.onChunk?.(this.response);
		return {
			text: this.response,
			provider: "mock",
			exitCode: 0,
		};
	}
}
