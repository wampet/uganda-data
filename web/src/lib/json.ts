/**
 * Serialise data for a `<script type="application/json">` block.
 *
 * Plain JSON.stringify is not safe there: a string containing `</script>`
 * (or `<!--`) would end the block early and let the rest run as HTML/JS. Our
 * data comes from third-party files (UBOS), so we escape the characters that
 * can break out of a script element. The result is still valid JSON, and
 * JSON.parse restores the original text exactly.
 */
export function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
