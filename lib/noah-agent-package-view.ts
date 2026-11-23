type PackageView = {
  id?: string;
  source?: { artifact?: { schema: string } };
  fund?: { categories?: readonly string[]; tags?: readonly string[] };
};

// These are display cues from the Noah publication form, agent artifact and publisher's explicit classification.
// They grant no permission to install or run a package.
export function isNoahAgentPackage(manifest: PackageView) {
  return manifest.source?.artifact?.schema === 'noah-source/1' ||
    /^dev\.noah-[a-f\d]{16}\.agent-[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(manifest.id ?? '') ||
    [...(manifest.fund?.categories ?? []), ...(manifest.fund?.tags ?? [])].some(tag => /^(?:agent|エージェント)$/i.test(tag.trim()));
}

/** Keep the published ordering when agent packages and regular tools share one result set. */
export function groupNoahAgentPackages<T extends { manifest: PackageView }>(items: readonly T[]) {
  const groups: { agents: boolean; items: T[] }[] = [];
  for (const item of items) {
    const agents = isNoahAgentPackage(item.manifest);
    const group = groups.at(-1);
    if (group?.agents === agents) group.items.push(item);
    else groups.push({ agents, items: [item] });
  }
  return groups;
}
