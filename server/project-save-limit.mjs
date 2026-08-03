function projectSaveFiles(entries) {
  return entries.filter(
    (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"),
  );
}

export function boundedProjectSaveEntries(entries, limit) {
  return projectSaveFiles(entries)
    .sort((first, second) => {
      const firstName = first.name.toLowerCase();
      const secondName = second.name.toLowerCase();
      return firstName < secondName ? -1 : firstName > secondName ? 1 : 0;
    })
    .slice(0, limit);
}

export function canWriteProjectSave(entries, targetExists, limit) {
  const files = projectSaveFiles(entries);
  return targetExists || files.length < limit;
}
