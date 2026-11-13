import presentationVideoText from "@/assets/presentation/visao-plataforma.mp4.asset.json?raw";
import { readPresentationAssetUrl } from "./assetPointer";

// Raw text avoids the Vite JSON transform throwing before React can recover.
const screenAssets = import.meta.glob<string>("/src/assets/presentation/*.jpg.asset.json", {
  query: "?raw",
  import: "default",
  eager: true,
});

export function builtInScreenUrl(id: string) {
  return readPresentationAssetUrl(screenAssets[`/src/assets/presentation/${id}.jpg.asset.json`]);
}

export const builtInVideoUrl = readPresentationAssetUrl(presentationVideoText);