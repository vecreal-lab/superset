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

const PROTOCOL_OUTPUT_HEADINGS = [
  "01-key-insights",
  "02-conflicts-with-current-positioning",
  "03-confirmations",
  "04-new-ideas",
  "05-quotable-lines",
  "06-domain-knowledge-to-capture",
  "07-strategy-ledger-candidates",
  "08-lesson-candidates",
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
  "intake_type": "workshop | article | customer-pain | competitor | design-reference | industry-report | advisor-conversation | founder-brain-dump | code-reference | other",
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

Goal: follow projects/_shared/foundations/intake-protocol.md Mode A and convert the operator's raw intake material into durable, citeable intake outputs without modifying foundation documents.

Project: ${source.projectId}
Intake title: ${source.title}
Intake type: ${source.intakeType}
Folder: ${source.folderPath}

Use these locked rules:
- Do not rewrite or invent foundation content.
- Classify first, then digest.
- Produce concrete propagation candidates, but do not apply them.
- Match the Mode A output names and order from intake-protocol.md exactly.
- Default lessons candidates to Tier 2 unless the evidence clearly says Tier 1 or Tier 3.
- Flag foundation-class changes as owner-only follow-ups instead of editing them.

Project foundations available for context:
${renderFoundations(source.foundations)}

Raw intake material:
${source.rawInput}

Return markdown with these exact headings:
${PROTOCOL_OUTPUT_HEADINGS.map((key) => `# ${key}`).join("\n")}

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

export type WorkOrderComposerReference = {
  kind: "file" | "url" | "text";
  value: string;
  label?: string;
};

export type WorkOrderComposerPromptSource = {
  mode: "single" | "project-launch";
  projectId: string;
  operatorIntent: string;
  operatorMessage?: string;
  authorUser: string;
  assignedToUser: string;
  references: WorkOrderComposerReference[];
  priorDraftYaml?: string;
};

const renderComposerReferences = (references: WorkOrderComposerReference[]) =>
  references.length
    ? references
        .map((reference) => `- ${reference.kind}: ${reference.label || reference.value}`)
        .join("\n")
    : "- none";

const composerBasePrompt = (source: WorkOrderComposerPromptSource) => `You are INTAKE_STEWARD drafting queued Software Factory work orders from an operator's plain-English intent.

Follow these rules:
- Return ONLY JSON. No markdown fences.
- Keep user-facing language plain English.
- Do not modify files.
- Author defaults to ${source.authorUser}; assigned_to defaults to ${source.assignedToUser}.
- Every draft must have status queued, project_id ${source.projectId}, and depends_on populated when a dependency exists.
- Keep scopes reviewable; if the request is large, split into a small graph of work orders with clear dependency edges.

Project: ${source.projectId}
Mode: ${source.mode}
References:
${renderComposerReferences(source.references)}

Original operator intent:
${source.operatorIntent}

${source.operatorMessage ? `Latest operator refinement:\n${source.operatorMessage}\n` : ""}
${source.priorDraftYaml ? `Current draft YAML:\n${source.priorDraftYaml}\n` : ""}
`;

export const buildWorkOrderDraftPrompt = (source: WorkOrderComposerPromptSource) => `${composerBasePrompt(source)}
Return this JSON shape:
{
  "steward_turn": "plain-English summary of the draft and any assumptions",
  "work_orders": [
    {
      "title": "short durable work-order title",
      "intent": "plain-English work-order intent",
      "pipeline_variant": "dashboard_or_ui_feature | documentation_or_content | default",
      "risk_classification": "low | medium | high",
      "rigor_tier": "T1 | T2 | T3",
      "depends_on": [],
      "acceptance_criteria": ["specific check"],
      "verification_commands": ["command to run"]
    }
  ]
}`;

export const buildProjectLaunchWorkOrderPrompt = (source: WorkOrderComposerPromptSource) => `${composerBasePrompt(source)}
Return this JSON shape:
{
  "steward_turn": "plain-English summary of the proposed multi-WO graph",
  "work_orders": [
    {
      "title": "short durable work-order title",
      "intent": "plain-English work-order intent",
      "pipeline_variant": "dashboard_or_ui_feature | documentation_or_content | default",
      "risk_classification": "low | medium | high",
      "rigor_tier": "T1 | T2 | T3",
      "depends_on": ["temporary title or id of prerequisite draft"],
      "acceptance_criteria": ["specific check"],
      "verification_commands": ["command to run"]
    }
  ],
  "cohorts": [["title or id that can run first"], ["title or id that runs after dependencies"]]
}`;
