/** A media pointer can be empty during an upload; it must not block the app. */
export function readPresentationAssetUrl(source: unknown): string | undefined {
  if (typeof source !== "string" || !source.trim()) return undefined;
  try {
    const pointer: unknown = JSON.parse(source);
    if (!pointer || typeof pointer !== "object" || !("url" in pointer)) return undefined;
    const url = pointer.url;
    return typeof url === "string" && url.startsWith("/__l5e/assets-v1/") ? url : undefined;
  } catch {
    return undefined;
  }
}