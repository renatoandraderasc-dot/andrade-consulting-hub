export interface ModuleAccessRow { module: string; allowed: boolean }

// No saved rows means unrestricted access, matching getAllowedModules.
export function selectedModules(rows: ModuleAccessRow[], catalog: readonly string[]): string[] {
  return rows.length === 0 ? [...catalog] : rows.filter(row => row.allowed).map(row => row.module);
}

export function sameSelection(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every(key => b.includes(key));
}

// Send only explicit changes; retain permissions unknown to this screen.
export function moduleAccessChanges(rows: ModuleAccessRow[], selected: readonly string[], catalog: readonly string[]): ModuleAccessRow[] {
  const initial = selectedModules(rows, catalog);
  if (sameSelection(initial, selected)) return [];
  return catalog.filter(key => rows.length === 0 || initial.includes(key) !== selected.includes(key))
    .map(module => ({ module, allowed: selected.includes(module) }));
}