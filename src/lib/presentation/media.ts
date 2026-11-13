export type PresentationMedia = {
  id: string;
  file: Blob;
  name: string;
  kind: "image" | "video";
};

const DATABASE = "andrade-presentation-media";
const STORE = "media";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Não foi possível abrir as mídias salvas neste navegador."));
  });
}

export async function getPresentationMedia(): Promise<PresentationMedia[]> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("Não foi possível carregar as mídias."));
    });
  } finally { db.close(); }
}

export async function savePresentationMedia(media: PresentationMedia) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(media);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error("Não foi possível salvar. Confira o espaço disponível no navegador."));
      transaction.onabort = () => reject(new Error("A gravação da mídia foi interrompida."));
    });
  } finally { db.close(); }
}

export async function removePresentationMedia(id: string) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error("Não foi possível remover a mídia."));
    });
  } finally { db.close(); }
}

export function presentationFileKind(type: string, logo = false): "image" | "video" | null {
  if (["image/png", "image/jpeg", "image/webp"].includes(type)) return "image";
  if (!logo && ["video/mp4", "video/webm", "video/quicktime"].includes(type)) return "video";
  return null;
}