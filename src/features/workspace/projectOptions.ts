import type {
  BrowserInputProjectOption,
  InputProjectOption,
} from "../../app/appTypes";

export function projectOptionLabel(
  project: InputProjectOption,
  itemLabel = "música",
) {
  const plural =
    itemLabel === "episódio"
      ? "episódios"
      : `${itemLabel}${itemLabel.endsWith("s") ? "" : "s"}`;
  return `${project.name} (${project.trackCount} ${
    project.trackCount === 1 ? itemLabel : plural
  })`;
}

export function isBrowserInputProject(
  project: InputProjectOption,
): project is BrowserInputProjectOption {
  return project.source === "browser" && Boolean(project.handle);
}
