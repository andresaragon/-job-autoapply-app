// Fake mínimo de Supabase en memoria: tablas, filtros eq/gt/in, select/insert/update/upsert/delete,
// single/maybeSingle y rpc simuladas. Cada operación cede el control (await) antes de ejecutarse
// para que los tests de concurrencia puedan observar intercalados reales.
type Row = Record<string, unknown>;
type Filter = { op: "eq" | "gt" | "in"; col: string; val: unknown };
type DbError = { message: string; code?: string };
type Result = { data: unknown; error: DbError | null; count?: number };

export interface FakeUser {
  id: string;
  email?: string;
}

export interface FakeDb {
  tables: Record<string, Row[]>;
  user: FakeUser | null;
  /** Llamadas registradas por tabla para asserts de filtros no evaluados (or, ilike, order, range). */
  calls: { table: string; method: string; args: unknown[] }[];
  rpcs: Record<string, (args: Row) => { data: unknown; error: DbError | null }>;
  /** Fuerza error en una operación: clave "tabla.operacion". */
  failures: Record<string, string>;
  admin: { getUserById: (id: string) => Promise<{ data: { user: FakeUser | null } }> };
}

let seq = 0;

export function createFakeDb(seed: Record<string, Row[]> = {}, user: FakeUser | null = null): FakeDb {
  const db: FakeDb = {
    tables: Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))])),
    user,
    calls: [],
    rpcs: {},
    failures: {},
    admin: {
      getUserById: async (id) => ({ data: { user: id === db.user?.id ? db.user : { id, email: "worker@example.com" } } }),
    },
  };
  return db;
}

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private filters: Filter[] = [];
  private mode: "many" | "single" | "maybe" = "many";
  private returning = false;
  private wantCount = false;
  private onConflict: string[] = [];

  constructor(private db: FakeDb, private table: string) {}

  private log(method: string, args: unknown[]) {
    this.db.calls.push({ table: this.table, method, args });
  }

  select(_cols?: string, opts?: { count?: string }) {
    this.log("select", [_cols, opts]);
    if (this.op === "select") this.wantCount = Boolean(opts?.count);
    else this.returning = true;
    return this;
  }
  insert(p: Row | Row[]) { this.op = "insert"; this.payload = p; this.log("insert", [p]); return this; }
  update(p: Row) { this.op = "update"; this.payload = p; this.log("update", [p]); return this; }
  upsert(p: Row | Row[], opts?: { onConflict?: string }) {
    this.op = "upsert"; this.payload = p;
    this.onConflict = opts?.onConflict?.split(",").map((s) => s.trim()) ?? [];
    this.log("upsert", [p, opts]);
    return this;
  }
  delete() { this.op = "delete"; this.log("delete", []); return this; }
  eq(col: string, val: unknown) { this.filters.push({ op: "eq", col, val }); return this; }
  gt(col: string, val: unknown) { this.filters.push({ op: "gt", col, val }); return this; }
  in(col: string, val: unknown[]) { this.filters.push({ op: "in", col, val }); return this; }
  // Filtros/orden/paginación: solo se registran (asserts sobre la consulta construida).
  or(...a: unknown[]) { this.log("or", a); return this; }
  order(...a: unknown[]) { this.log("order", a); return this; }
  range(...a: unknown[]) { this.log("range", a); return this; }
  limit(...a: unknown[]) { this.log("limit", a); return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }

  private matches(row: Row) {
    return this.filters.every((f) => {
      const v = row[f.col];
      if (f.op === "eq") return v === f.val;
      if (f.op === "gt") return (v as number) > (f.val as number);
      return (f.val as unknown[]).includes(v);
    });
  }

  private shape(rows: Row[], count?: number): Result {
    if (this.mode === "many") return { data: rows, error: null, count };
    if (rows.length === 1 || (this.mode === "maybe" && rows.length <= 1)) {
      return { data: rows[0] ?? null, error: null };
    }
    if (this.mode === "maybe") return { data: null, error: { message: "multiple rows", code: "PGRST116" } };
    return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } };
  }

  private async run(): Promise<Result> {
    await Promise.resolve(); // punto de intercalado
    const failure = this.db.failures[`${this.table}.${this.op}`];
    if (failure) return { data: null, error: { message: failure } };
    const rows = (this.db.tables[this.table] ??= []);

    switch (this.op) {
      case "select": {
        const found = rows.filter((r) => this.matches(r)).map((r) => ({ ...r }));
        return this.shape(found, this.wantCount ? found.length : undefined);
      }
      case "update": {
        const targets = rows.filter((r) => this.matches(r));
        for (const r of targets) {
          const next = { ...r, ...(this.payload as Row) };
          if (this.table === "subscriptions" && (next.creditos_disponibles as number) < 0) {
            return { data: null, error: { message: "violates check constraint chk_creditos_no_negativos", code: "23514" } };
          }
          Object.assign(r, next);
        }
        return this.returning ? this.shape(targets.map((r) => ({ ...r }))) : { data: null, error: null };
      }
      case "insert": {
        const list = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
        const created = list.map((p) => ({ id: `${this.table}-${++seq}`, ...p }));
        rows.push(...created);
        return this.returning ? this.shape(created.map((r) => ({ ...r }))) : { data: null, error: null };
      }
      case "upsert": {
        const list = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
        const out: Row[] = [];
        for (const p of list) {
          const existing = this.onConflict.length
            ? rows.find((r) => this.onConflict.every((c) => r[c] === p[c]))
            : undefined;
          if (existing) { Object.assign(existing, p); out.push({ ...existing }); }
          else { const row = { id: `${this.table}-${++seq}`, ...p }; rows.push(row); out.push({ ...row }); }
        }
        return this.returning ? this.shape(out) : { data: null, error: null };
      }
      case "delete": {
        this.db.tables[this.table] = rows.filter((r) => !this.matches(r));
        return { data: null, error: null };
      }
    }
  }

  then<T1 = Result, T2 = never>(
    onfulfilled?: ((v: Result) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((r: unknown) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    return this.run().then(onfulfilled, onrejected);
  }
}

export function fakeClient(db: FakeDb) {
  return {
    from: (table: string) => new Query(db, table),
    rpc: async (name: string, args: Row = {}) => {
      await Promise.resolve();
      const fn = db.rpcs[name];
      if (!fn) return { data: null, error: { message: `rpc ${name} no existe (fake)` } };
      return fn(args);
    },
    auth: {
      getUser: async () => ({ data: { user: db.user }, error: null }),
      admin: db.admin,
    },
  };
}

/** Emula las funciones SQL reserve_credit / refund_credit de la migración de créditos (operación atómica). */
export function installCreditRpcs(db: FakeDb) {
  db.rpcs.reserve_credit = ({ p_user_id }) => {
    const sub = db.tables.subscriptions?.find((s) => s.user_id === p_user_id);
    if (!sub || (sub.creditos_disponibles as number) <= 0) return { data: null, error: null };
    sub.creditos_disponibles = (sub.creditos_disponibles as number) - 1;
    return { data: sub.creditos_disponibles, error: null };
  };
  db.rpcs.refund_credit = ({ p_user_id }) => {
    const sub = db.tables.subscriptions?.find((s) => s.user_id === p_user_id);
    if (!sub) return { data: null, error: null };
    sub.creditos_disponibles = (sub.creditos_disponibles as number) + 1;
    return { data: sub.creditos_disponibles, error: null };
  };
}
