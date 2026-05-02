import type { IntakeListItem, IntakeOutputKey } from "main/lib/factory-intake";

type PromptFoundation = {
  label: string;
  sourcePath: string;
  content: string;
};

type PromptIntakeSource = {
  title: string;
  projectId: string;
  intakeType: string;
  folderPath: string;
  rawInput: string;
  outputs: Partial<Record<IntakeOutputKey, string>>;
  propagationPlan?: string;
  dialogueHistory?: string;
  foundations: PromptFoundation[];
};

const OUTPUT_KEYS: IntakeOutputKey[] = [
  "01-key-insights",
  "02-confirmed-facts",
  "03-open-questions",
  "04-product-implications",
  "05-domain-knowledge",
  "06-strategy-signals",
  "07-lessons-candidates",
  "08-propagation-targets",
];

const renderFoundations = (foundations: PromptFoundation[]) => {
  if (foundations.length === 0) {
    return "No project foundations were found for this intake.";
  }

  return foundations
    .map(
      (foundation) =>
        `## ${foundation.label}\nSource: ${foundation.sourcePath}\n\n${foundation.content}`,
    )
    .join("\n\n---\n\n");
};

const renderOutputs = (outputs: Partial<Record<IntakeOutputKey, string>>) => {
  const sections = OUTPUT_KEYS.map((key) => {
    const content = outputs[key]?.trim();
    return `## ${key}\n${content || "Not produced yet."}`;
  });

  return sections.join("\n\n");
};

export const buildIntakeClassificationPrompt = (source: {
  title: string;
  projectId: string;
  rawInput: string;
  attachmentPaths: string[];
}) => `You are INTAKE_STEWARD classifying a new Layer 2 intake for the Software Factory.

Return ONLY compact JSON with this shape:
{
  "intake_type": "workshop | founder-brain-dump | customer-pain | competitor-news | research-note | other",
  "title": "short durable title",
  "slug": "kebab-case-slug",
  "project_id": "${source.projectId}",
  "confidence": 0.0,
  "reason": "plain-English reason"
}

Project: ${source.projectId}
Initial title: ${source.title}
Attachments:
${source.attachmentPaths.map((path) => `- ${path}`).join("\n") || "- none"}

Raw owner input:
${source.rawInput}`;

export const buildIntakeDigestPrompt = (source: PromptIntakeSource) => `You are INTAKE_STEWARD digesting a Layer 2 intake.

Goal: convert the operator's raw intake material into durable, citeable intake outputs without modifying foundation documents.

Project: ${source.projectId}
Intake title: ${source.title}
Intake type: ${source.intakeType}
Folder: ${source.folderPath}

Use these locked rules:
- Do not rewrite or invent foundation content.
- Classify first, then digest.
- Produce concrete propagation candidates, but do not apply them.
- Default lessons candidates to Tier 2 unless the evidence clearly says Tier 1 or Tier 3.
- Flag foundation-class changes as owner-only follow-ups instead of editing them.

Project foundations available for context:
${renderFoundations(source.foundations)}

Raw intake material:
${source.rawInput}

Return markdown with these exact headings:
${OUTPUT_KEYS.map((key) => `# ${key}`).join("\n")}

Each section should be concise, evidence-oriented, and cite the source intake folder where relevant.`;

export const buildIntakeDialoguePrompt = (source: PromptIntakeSource & {
  operatorMessage: string;
}) => `You are INTAKE_STEWARD helping the operator refine an already-digested Layer 2 intake.

Project: ${source.projectId}
Intake title: ${source.title}
Intake type: ${source.intakeType}
Folder: ${source.folderPath}

Your job:
- Answer the operator in plain English.
- Use the intake outputs and project foundations as context.
- If the operator proposes propagation, restate the target and ask for clear approval unless the approval is already explicit.
- Never directly edit foundation-class docs.
- If propagation is appropriate, explain the proposed target files and why.

Project foundations:
${renderFoundations(source.foundations)}

Current intake outputs:
${renderOutputs(source.outputs)}

Current propagation plan:
${source.propagationPlan || "No propagation plan exists yet."}

Dialogue history:
${source.dialogueHistory || "No prior dialogue."}

Operator message:
${source.operatorMessage}`;

export const buildIntakePropagationPrompt = (source: PromptIntakeSource & {
  proposedTargets: string[];
}) => `You are INTAKE_STEWARD reviewing a Layer 2 intake propagation plan before it is applied.

Project: ${source.projectId}
Intake: ${source.title}
Folder: ${source.folderPath}

Proposed target paths:
${source.proposedTargets.map((target) => `- ${target}`).join("\n") || "- none"}

Rules:
- Propagation is atomic-or-none.
- Foundation-class docs, work orders, and docs/brand are forbidden in Chunk 2.
- Preserve source_text and citations where possible.
- Return a concise approval or rejection with reasons.

Current intake outputs:
${renderOutputs(source.outputs)}

Current plan:
${source.propagationPlan || "No propagation plan exists yet."}`;

export const buildIntakeListLabel = (item: IntakeListItem) =>
  `${item.title} (${item.project_id} / ${item.type} / ${item.status})`;
