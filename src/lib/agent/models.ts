/**
 * Central model ids for the agent's INTERNAL utility LLM calls (risk
 * classifier, fan-memory extraction, persona bootstrap). These are NOT the
 * per-persona chat model (that's user-selectable and stored on the persona).
 *
 * Uses the `-latest` alias on purpose: Google deprecates pinned minor versions
 * (e.g. gemini-2.5-flash-lite was retired 2026-07), and the alias always
 * resolves to the current stable flash — so a deprecation can never break these.
 */
export const AGENT_UTILITY_MODEL = 'gemini-flash-latest'
