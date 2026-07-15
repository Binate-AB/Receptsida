// ============================================
// JSON Repair — shared helpers for LLM output
// Extracted from services/claude.js so the Nisse
// AI boundary can reuse the same battle-tested logic.
// ============================================

/**
 * Attempt to repair common JSON issues from LLM output:
 * - Trailing commas: [1, 2,] or {"a": 1,}
 * - Truncated output: close unclosed brackets/braces
 */
export function repairJSON(str) {
  // Strip trailing commas before } or ]
  let repaired = str.replace(/,\s*([}\]])/g, '$1');

  // If output was truncated (stop_reason=max_tokens), try to close brackets
  try {
    JSON.parse(repaired);
    return repaired;
  } catch {
    // Trim trailing incomplete value (e.g. truncated string or number)
    repaired = repaired.replace(/,\s*"[^"]*$/, '');   // trailing incomplete key/string
    repaired = repaired.replace(/,\s*\d+$/, '');       // trailing incomplete number
    repaired = repaired.replace(/:\s*"[^"]*$/, ': ""'); // truncated string value
    // Re-strip trailing commas
    repaired = repaired.replace(/,\s*([}\]])/g, '$1');

    // Track unclosed brackets/braces with a stack so they can be
    // closed in correct (reverse nesting) order.
    const stack = [];
    let inString = false;
    let escape = false;

    for (const ch of repaired) {
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{' || ch === '[') stack.push(ch);
      else if (ch === '}' || ch === ']') stack.pop();
    }

    // Unterminated string at the very end — close it first
    if (inString) repaired += '"';

    while (stack.length > 0) {
      repaired += stack.pop() === '{' ? '}' : ']';
    }
    // Final trailing-comma cleanup after bracket-closing
    repaired = repaired.replace(/,\s*([}\]])/g, '$1');

    return repaired;
  }
}

/**
 * Parse JSON from raw LLM text: strips markdown fences, extracts the
 * outermost object, and falls back to repairJSON on failure.
 * Throws if no valid JSON can be recovered.
 */
export function parseJsonLoose(rawText) {
  const clean = String(rawText).replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    const candidate = match ? match[0] : clean;
    return JSON.parse(repairJSON(candidate));
  }
}
