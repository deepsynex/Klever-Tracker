/** Groups as an indented tree (parents first, children under them), for the access checklist. */
export function groupTree<G extends { id: string; parentId: string | null; name: string }>(groups: G[]): Array<{ group: G; depth: number }> {
  const ids = new Set(groups.map((g) => g.id));
  const byParent = new Map<string | null, G[]>();
  for (const g of groups) {
    const parent = g.parentId && ids.has(g.parentId) ? g.parentId : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), g]);
  }
  const out: Array<{ group: G; depth: number }> = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const g of [...(byParent.get(parent) ?? [])].sort((a, b) => a.name.localeCompare(b.name))) {
      if (seen.has(g.id)) continue; // guards against a parent cycle in the data
      seen.add(g.id);
      out.push({ group: g, depth });
      walk(g.id, depth + 1);
    }
  };
  walk(null, 0);
  // Groups caught in a parent loop never hang off the top level: list them there anyway.
  for (const g of groups) {
    if (seen.has(g.id)) continue;
    seen.add(g.id);
    out.push({ group: g, depth: 0 });
    walk(g.id, 1);
  }
  return out;
}
