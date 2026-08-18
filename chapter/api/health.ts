/**
 * Presence probe for the server routes.
 *
 * Phases 1-3 are a pure static site. Voice and AI grading only exist when the
 * app is deployed somewhere that runs functions AND the relevant keys are set,
 * so the client asks this once per launch and hides both features entirely if
 * the answer is no. A dead button is worse than a missing one.
 */
export const config = { runtime: 'nodejs' }

export default function handler(_req: Request): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      // Never the keys themselves — only whether they are configured.
      transcribe: Boolean(process.env['TRANSCRIBE_URL'] && process.env['TRANSCRIBE_KEY']),
      grade: Boolean(process.env['ANTHROPIC_API_KEY']),
    }),
    { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } },
  )
}
