import fs from "node:fs/promises";
import { XMLParser, XMLValidator } from "fast-xml-parser";

export async function safeSvgBuffer(filePath) {
  const svg = await fs.readFile(filePath, "utf8");
  validateSafeSvg(svg);
  return Buffer.from(svg);
}

export function validateSafeSvg(svg) {
  const validation = XMLValidator.validate(svg);
  if (validation !== true) {
    throw new Error("SVG invalido.");
  }
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    processEntities: false,
  });
  walkSvg(parser.parse(svg));
}

function walkSvg(value, key = "") {
  const normalizedKey = key.replace(/^@_/, "").toLowerCase();
  if (
    ["script", "foreignobject", "iframe", "object", "embed"].includes(
      normalizedKey,
    )
  ) {
    throw new Error("SVG contém elemento não permitido.");
  }
  if (
    normalizedKey === "style" &&
    /@import|url\s*\(\s*['"]?(?:https?:|file:|\/\/)/iu.test(
      svgTextContent(value),
    )
  ) {
    throw new Error("SVG contém estilo externo não permitido.");
  }
  if (!value || typeof value !== "object") return;
  for (const [childKey, childValue] of Object.entries(value)) {
    const attribute = childKey.replace(/^@_/, "").toLowerCase();
    if (childKey.startsWith("@_") && attribute.startsWith("on")) {
      throw new Error("SVG contém evento não permitido.");
    }
    if (
      childKey.startsWith("@_") &&
      ["href", "xlink:href", "src"].includes(attribute) &&
      typeof childValue === "string" &&
      childValue &&
      !childValue.startsWith("#")
    ) {
      throw new Error("SVG contém referência externa não permitida.");
    }
    if (
      childKey.startsWith("@_") &&
      typeof childValue === "string" &&
      /url\s*\(\s*['"]?(?:https?:|file:|\/\/)/i.test(childValue)
    ) {
      throw new Error("SVG contém URL externa não permitida.");
    }
    walkSvg(childValue, childKey);
  }
}

function svgTextContent(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(svgTextContent).join("");
  if (!value || typeof value !== "object") return "";
  return Object.entries(value)
    .filter(([childKey]) => !childKey.startsWith("@_"))
    .map(([, childValue]) => svgTextContent(childValue))
    .join("");
}
