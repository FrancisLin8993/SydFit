import { readFileSync } from "node:fs";

// Loads agent instructions from the markdown files in src/prompts/.
//
// Prompts live in the repo (not in Langfuse prompt management) so that
// prompt and code change together in one commit — tool renames repeatedly
// left the hosted prompts referencing tools that no longer existed, and a
// missing/mislabeled hosted prompt once crashed the server at startup.
// Local files also remove the per-cold-start network fetches to Langfuse.
//
// The path resolves relative to this module, so it works both in dev
// (ts-node/tsx running from src/) and in production (compiled to dist/ —
// the build script copies src/prompts/ into dist/prompts/, since tsc alone
// doesn't emit non-TS assets; see "build" in package.json).
//
// A missing file throws at module load and fails the boot loudly. Unlike
// the old network fetch, local file presence is deterministic and covered
// by tests, so a fallback would only mask a packaging bug.

const PROMPT_NAMES = [
	"triage-agent",
	"traffic-advice",
	"weather-advice",
] as const;

export type PromptName = (typeof PROMPT_NAMES)[number];

export function loadPromptInstructions(name: PromptName): string {
	if (!PROMPT_NAMES.includes(name)) {
		throw new Error(`Unknown prompt: "${name}"`);
	}

	const url = new URL(`../prompts/${name}.md`, import.meta.url);
	const content = readFileSync(url, "utf-8").trim();

	if (!content) {
		throw new Error(`Prompt file is empty: ${name}.md`);
	}

	return content;
}
