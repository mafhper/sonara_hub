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

export function serializeBoundedProjectSnapshot(body, save, maximumBytes) {
  const serialized = JSON.stringify(
    { ...body, saveId: save.id, saveName: save.name },
    null,
    2,
  );
  return Buffer.byteLength(serialized, "utf8") <= maximumBytes
    ? serialized
    : null;
}
