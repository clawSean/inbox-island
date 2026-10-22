import { ENGINE_VERSIONS, assertIdentifier } from "./contracts.mjs";
import {
  ACCOUNT_PREFIX,
  RECORD_VERSION,
  createSnapshot,
  isGeneration,
  validateRecord,
  validateSnapshot,
} from "./derived-schema.mjs";

function newGeneration() {
  if (typeof crypto?.randomUUID !== "function") throw new Error("SECURE_GENERATION_UNAVAILABLE");
  return crypto.randomUUID();
}

function mutation(action, value = undefined) {
  return action === "put" ? { action, value } : { action };
}

function assertActiveSignal(signal) {
  if (signal === undefined) return;
  if (!signal || typeof signal.aborted !== "boolean") throw new Error("INVALID_ABORT_SIGNAL");
  if (signal.aborted) throw new Error("OPERATION_ABORTED");
}

export class MemoryKeyValueAdapter {
  #values = new Map();

  async get(key) {
    return this.#values.has(key) ? structuredClone(this.#values.get(key)) : null;
  }

  async set(key, value) {
    this.#values.set(key, structuredClone(value));
  }

  async delete(key) {
    this.#values.delete(key);
  }

  async keys() {
    return [...this.#values.keys()];
  }

  async mutate(key, update, { signal } = {}) {
    assertActiveSignal(signal);
    const current = this.#values.has(key) ? structuredClone(this.#values.get(key)) : null;
    const outcome = update(current);
    assertActiveSignal(signal);
    if (outcome && typeof outcome.then === "function") throw new Error("ASYNC_MUTATION_FORBIDDEN");
    if (outcome?.action === "delete") this.#values.delete(key);
    else if (outcome?.action === "put") this.#values.set(key, structuredClone(outcome.value));
    else if (outcome?.action !== "noop") throw new Error("INVALID_MUTATION_OUTCOME");
    return outcome.result === undefined ? null : structuredClone(outcome.result);
  }

  async clearPrefix(matchPrefix) {
    for (const key of this.#values.keys()) {
      if (key.startsWith(matchPrefix)) this.#values.delete(key);
    }
  }
}

export class DerivedStateStore {
  constructor(adapter, { now = () => new Date(), generation = newGeneration } = {}) {
    if (!adapter || ["get", "set", "delete", "keys", "mutate", "clearPrefix"]
      .some((name) => typeof adapter[name] !== "function")) {
      throw new Error("INVALID_STORAGE_ADAPTER");
    }
    this.adapter = adapter;
    this.now = now;
    this.generation = generation;
  }

  async beginGeneration(accountId, { signal } = {}) {
    assertIdentifier(accountId, "account_id");
    assertActiveSignal(signal);
    const generation = this.generation();
    if (!isGeneration(generation)) throw new Error("INVALID_GENERATION");
    await this.adapter.mutate(`${ACCOUNT_PREFIX}${accountId}`, (current) => mutation("put", {
      recordVersion: RECORD_VERSION,
      accountId,
      activeGeneration: generation,
      snapshot: current === null ? null : validateRecord(current, accountId).snapshot,
    }), { signal });
    return generation;
  }

  async saveAccount(accountId, results, { generation, signal } = {}) {
    assertIdentifier(accountId, "account_id");
    if (!Array.isArray(results)) throw new Error("INVALID_RESULTS");
    if (!isGeneration(generation)) throw new Error("INVALID_GENERATION");
    assertActiveSignal(signal);
    const snapshot = createSnapshot(accountId, this.now().toISOString(), results);
    await this.adapter.mutate(`${ACCOUNT_PREFIX}${accountId}`, (current) => {
      assertActiveSignal(signal);
      const record = current === null ? null : validateRecord(current, accountId);
      if (!record || record.activeGeneration !== generation) throw new Error("STALE_GENERATION");
      return mutation("put", { ...record, activeGeneration: null, snapshot });
    }, { signal });
  }

  async cancelGeneration(accountId, { generation } = {}) {
    assertIdentifier(accountId, "account_id");
    if (!isGeneration(generation)) throw new Error("INVALID_GENERATION");
    return this.adapter.mutate(`${ACCOUNT_PREFIX}${accountId}`, (current) => {
      if (current === null) return { action: "noop", result: false };
      const record = validateRecord(current, accountId);
      if (record.activeGeneration !== generation) return { action: "noop", result: false };
      if (record.snapshot === null) {
        return { action: "delete", result: true };
      }
      return {
        action: "put",
        value: { ...record, activeGeneration: null },
        result: true,
      };
    });
  }

  async loadAccount(accountId) {
    assertIdentifier(accountId, "account_id");
    const current = await this.adapter.get(`${ACCOUNT_PREFIX}${accountId}`);
    if (current === null) return null;
    const record = validateRecord(current, accountId);
    if (record.snapshot === null) return null;
    const snapshot = validateSnapshot(record.snapshot, accountId);
    return snapshot.results.every(({ engineVersion }) => ENGINE_VERSIONS.includes(engineVersion))
      ? snapshot : null;
  }

  async loadLatestSnapshot({ excludeAccountIds = [] } = {}) {
    if (!Array.isArray(excludeAccountIds)) throw new Error("INVALID_ACCOUNT_EXCLUSIONS");
    const excluded = new Set(excludeAccountIds);
    const snapshots = [];
    for (const key of await this.adapter.keys()) {
      if (!key.startsWith(ACCOUNT_PREFIX)) continue;
      const accountId = key.slice(ACCOUNT_PREFIX.length);
      if (excluded.has(accountId)) continue;
      const snapshot = await this.loadAccount(accountId);
      if (snapshot) snapshots.push(snapshot);
    }
    snapshots.sort((left, right) => (
      right.savedAt.localeCompare(left.savedAt) || left.accountId.localeCompare(right.accountId)
    ));
    return snapshots[0] ?? null;
  }

  async clearAccount(accountId) {
    assertIdentifier(accountId, "account_id");
    const key = `${ACCOUNT_PREFIX}${accountId}`;
    await this.adapter.mutate(key, () => mutation("delete"));
    if (await this.adapter.get(key) !== null) throw new Error("CLEAR_ACCOUNT_FAILED");
  }

  async clearAll() {
    await this.adapter.clearPrefix(ACCOUNT_PREFIX);
    if ((await this.adapter.keys()).some((key) => key.startsWith(ACCOUNT_PREFIX))) {
      throw new Error("CLEAR_ALL_FAILED");
    }
  }
}
