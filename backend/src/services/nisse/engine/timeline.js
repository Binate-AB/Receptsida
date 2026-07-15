// ============================================
// Nisse Engine — Cooking timeline builder
// Topological scheduling of template steps (a DAG via
// dependsOn), with coordinated child/adult branch lanes
// that finish at the same time. Pure, deterministic.
// ============================================

/**
 * Build an execution timeline from template steps.
 *
 * Steps: [{ id, branch: 'base'|'child'|'adult', text, voiceCue?,
 *           durationMin, activeMin?, dependsOn: [], timerNeeded?, ... }]
 *
 * @param {Array<object>} steps
 * @param {object} [options]
 * @param {'base'|'split'} [options.branch='base'] —
 *   'base' = only shared-base steps (recipes without branches, or single variant)
 *   'split' = base + child + adult lanes, coordinated to finish together
 * @returns {{ steps: Array<object>, lanes: string[], totalMin: number, activeMin: number }}
 * @throws {Error} on dependency cycles or unknown dependsOn ids
 */
export function buildTimeline(steps, options = {}) {
  const mode = options.branch || 'base';
  const included = (steps || []).filter((s) =>
    mode === 'split' ? true : (s.branch || 'base') === 'base'
  );

  if (included.length === 0) {
    return { steps: [], lanes: [], totalMin: 0, activeMin: 0 };
  }

  const byId = new Map(included.map((s) => [s.id, s]));

  // Validate dependencies (deps may point to excluded branch steps in 'base'
  // mode — that is a template error, so fail loudly)
  for (const step of included) {
    for (const dep of step.dependsOn || []) {
      if (!byId.has(dep)) {
        throw new Error(`Step "${step.id}" depends on unknown/excluded step "${dep}"`);
      }
    }
  }

  // Kahn topological sort — throws on cycle
  const indegree = new Map(included.map((s) => [s.id, (s.dependsOn || []).length]));
  const dependents = new Map(included.map((s) => [s.id, []]));
  for (const step of included) {
    for (const dep of step.dependsOn || []) {
      dependents.get(dep).push(step.id);
    }
  }

  const queue = included.filter((s) => indegree.get(s.id) === 0).map((s) => s.id);
  const topoOrder = [];
  while (queue.length > 0) {
    const id = queue.shift();
    topoOrder.push(id);
    for (const next of dependents.get(id)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  if (topoOrder.length !== included.length) {
    throw new Error('Step dependency cycle detected in recipe template');
  }

  // Earliest-start scheduling: start = max(end of dependencies)
  const startMin = new Map();
  const endMin = new Map();
  for (const id of topoOrder) {
    const step = byId.get(id);
    const depEnd = Math.max(0, ...(step.dependsOn || []).map((d) => endMin.get(d)));
    startMin.set(id, depEnd);
    endMin.set(id, depEnd + (Number(step.durationMin) || 0));
  }

  // Coordinate branch lanes so child & adult variants finish together:
  // shift the entire shorter lane later by the end-time difference.
  // (Lane steps only depend on base steps or earlier steps in the same
  // lane, so a uniform forward shift keeps all dependencies satisfied.)
  if (mode === 'split') {
    const laneEnd = (lane) => {
      const ids = included.filter((s) => (s.branch || 'base') === lane).map((s) => s.id);
      return ids.length ? Math.max(...ids.map((id) => endMin.get(id))) : null;
    };
    const childEnd = laneEnd('child');
    const adultEnd = laneEnd('adult');

    if (childEnd != null && adultEnd != null && childEnd !== adultEnd) {
      const shorter = childEnd < adultEnd ? 'child' : 'adult';
      const delta = Math.abs(childEnd - adultEnd);
      for (const step of included) {
        if ((step.branch || 'base') === shorter) {
          startMin.set(step.id, startMin.get(step.id) + delta);
          endMin.set(step.id, endMin.get(step.id) + delta);
        }
      }
    }
  }

  const lanes = [...new Set(included.map((s) => s.branch || 'base'))];
  const scheduled = included
    .map((s) => ({
      ...s,
      lane: s.branch || 'base',
      startMin: startMin.get(s.id),
      endMin: endMin.get(s.id),
    }))
    .sort((a, b) => a.startMin - b.startMin || a.id.localeCompare(b.id));

  const totalMin = Math.max(...scheduled.map((s) => s.endMin));
  const activeMin = scheduled.reduce(
    (acc, s) => acc + (Number.isFinite(Number(s.activeMin)) ? Number(s.activeMin) : Number(s.durationMin) || 0),
    0
  );

  return { steps: scheduled, lanes, totalMin, activeMin };
}
