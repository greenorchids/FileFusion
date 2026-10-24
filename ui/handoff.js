/*
 * Hands files dropped on the landing page over to the converter page.
 * Uses IndexedDB, which can store File objects as-is.
 */
(function () {
  const DB = "filefusion",
    STORE = "handoff";

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function tx(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const result = fn(t.objectStore(STORE));
      t.oncomplete = () => {
        db.close();
        resolve(result.result);
      };
      t.onerror = () => {
        db.close();
        reject(t.error);
      };
    });
  }

  window.FFHandoff = {
    async put(files) {
      await tx("readwrite", (s) => s.put(Array.from(files), "files"));
    },
    async take() {
      try {
        const files = await tx("readonly", (s) => s.get("files"));
        await tx("readwrite", (s) => s.delete("files"));
        return files || [];
      } catch {
        return [];
      }
    },
  };
})();
