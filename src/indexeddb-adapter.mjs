const DEFAULT_DATABASE = "inbox-island-synthetic-proof";
const STORE_NAME = "derived";

function assertSignal(signal) {
  if (signal === undefined) return;
  if (!signal || typeof signal.aborted !== "boolean"
    || typeof signal.addEventListener !== "function"
    || typeof signal.removeEventListener !== "function") {
    throw new Error("INVALID_ABORT_SIGNAL");
  }
  if (signal.aborted) throw new Error("OPERATION_ABORTED");
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(new Error("INDEXEDDB_REQUEST_FAILED")), { once: true });
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(new Error("INDEXEDDB_TRANSACTION_ABORTED")), { once: true });
    transaction.addEventListener("error", () => reject(new Error("INDEXEDDB_TRANSACTION_FAILED")), { once: true });
  });
}

export class IndexedDbKeyValueAdapter {
  constructor({ databaseName = DEFAULT_DATABASE } = {}) {
    if (typeof indexedDB === "undefined") throw new Error("INDEXEDDB_UNAVAILABLE");
    if (!/^[A-Za-z0-9._-]{1,120}$/u.test(databaseName)) throw new Error("INVALID_DATABASE_NAME");
    this.databaseName = databaseName;
    this.databasePromise = null;
  }

  async database() {
    if (!this.databasePromise) {
      this.databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(this.databaseName, 1);
        request.addEventListener("upgradeneeded", () => {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) {
            request.result.createObjectStore(STORE_NAME);
          }
        });
        request.addEventListener("success", () => {
          request.result.addEventListener("versionchange", () => {
            request.result.close();
            this.databasePromise = null;
          }, { once: true });
          resolve(request.result);
        }, { once: true });
        request.addEventListener("error", () => reject(new Error("INDEXEDDB_OPEN_FAILED")), { once: true });
      }).catch((error) => {
        this.databasePromise = null;
        throw error;
      });
    }
    return this.databasePromise;
  }

  async get(key) {
    const database = await this.database();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const value = await requestResult(transaction.objectStore(STORE_NAME).get(key));
    await transactionDone(transaction);
    return value === undefined ? null : value;
  }

  async set(key, value) {
    const database = await this.database();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(structuredClone(value), key);
    await transactionDone(transaction);
  }

  async delete(key) {
    const database = await this.database();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(key);
    await transactionDone(transaction);
  }

  async keys() {
    const database = await this.database();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const keys = await requestResult(transaction.objectStore(STORE_NAME).getAllKeys());
    await transactionDone(transaction);
    return keys.map(String);
  }

  async mutate(key, update, { signal } = {}) {
    assertSignal(signal);
    const database = await this.database();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      let outcome;
      let updateError;
      const onAbort = () => {
        updateError = new Error("OPERATION_ABORTED");
        try { transaction.abort(); } catch { /* transaction already completed */ }
      };
      const cleanup = () => signal?.removeEventListener("abort", onAbort);
      signal?.addEventListener("abort", onAbort, { once: true });
      request.addEventListener("success", () => {
        try {
          assertSignal(signal);
          outcome = update(request.result === undefined ? null : structuredClone(request.result));
          if (outcome && typeof outcome.then === "function") throw new Error("ASYNC_MUTATION_FORBIDDEN");
          if (outcome?.action === "delete") store.delete(key);
          else if (outcome?.action === "put") store.put(structuredClone(outcome.value), key);
          else if (outcome?.action !== "noop") throw new Error("INVALID_MUTATION_OUTCOME");
        } catch (error) {
          updateError = error;
          transaction.abort();
        }
      }, { once: true });
      request.addEventListener("error", () => {
        updateError = new Error("INDEXEDDB_REQUEST_FAILED");
        transaction.abort();
      }, { once: true });
      transaction.addEventListener("complete", () => {
        cleanup();
        resolve(outcome?.result === undefined ? null : structuredClone(outcome.result));
      }, { once: true });
      transaction.addEventListener("abort", () => {
        cleanup();
        reject(updateError || new Error("INDEXEDDB_TRANSACTION_ABORTED"));
      }, { once: true });
      transaction.addEventListener("error", () => {
        cleanup();
        reject(updateError || new Error("INDEXEDDB_TRANSACTION_FAILED"));
      }, { once: true });
    });
  }

  async clearPrefix(matchPrefix) {
    const database = await this.database();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const request = transaction.objectStore(STORE_NAME).openCursor();
      request.addEventListener("success", () => {
        const cursor = request.result;
        if (!cursor) return;
        if (String(cursor.key).startsWith(matchPrefix)) cursor.delete();
        cursor.continue();
      });
      request.addEventListener("error", () => transaction.abort(), { once: true });
      transaction.addEventListener("complete", () => resolve(), { once: true });
      transaction.addEventListener("abort", () => reject(new Error("INDEXEDDB_CLEAR_FAILED")), { once: true });
      transaction.addEventListener("error", () => reject(new Error("INDEXEDDB_CLEAR_FAILED")), { once: true });
    });
  }

  async close() {
    if (!this.databasePromise) return;
    const databasePromise = this.databasePromise;
    this.databasePromise = null;
    const database = await databasePromise.catch(() => null);
    database?.close();
  }

  async destroy() {
    const database = await this.database();
    database.close();
    this.databasePromise = null;
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.databaseName);
      request.addEventListener("success", () => resolve(), { once: true });
      request.addEventListener("error", () => reject(new Error("INDEXEDDB_DELETE_FAILED")), { once: true });
      request.addEventListener("blocked", () => reject(new Error("INDEXEDDB_DELETE_BLOCKED")), { once: true });
    });
  }
}
