export type Tx = {
  id: string;
  type: "deposit" | "expense" | "transfer" | "carryover";
  amount: number;
  /** expense: category; transfer: source; deposit: direct-deposit sub-category */
  sub?: string;
  toSub?: string;
  /** deposit: direct deposit to a whole group (split by sub-category shares) */
  group?: string;
  /** transfer: money actually leaves the account (e.g. sent to an MMF) */
  out?: boolean;
  note: string;
  date: string;
  fee?: number;
};

export const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const feeOf = (t: Tx) => Number.isFinite(t.fee) ? (t.fee ?? 0) : 0;
export const isDirect = (t: Tx) => t.type === "deposit" && Boolean(t.sub || t.group);

export function calculateLedger(txs: Tx[], month: string) {
  const months = [...new Set([...txs.map(t => t.date.slice(0, 7)), month])].sort();
  const balances = new Map<string, number>();
  let closing = 0;
  let stats = { carry: 0, automaticCarry: 0, manualCarry: false, deposits: 0, direct: 0, autoBase: 0, income: 0, spent: 0, moved: 0, fees: 0, remaining: 0 };
  for (const m of months) {
    const entries = txs.filter(t => t.date.slice(0, 7) === m);
    const opening = entries.find(t => t.type === "carryover");
    const automaticCarry = closing;
    const carry = opening?.amount ?? automaticCarry;
    let balance = carry;
    let deposits = 0, direct = 0, spent = 0, moved = 0, fees = 0;
    if (opening) balances.set(opening.id, carry);
    for (const t of entries.filter(t => t.type !== "carryover").sort((a, b) => a.date.localeCompare(b.date))) {
      let delta = 0;
      if (t.type === "deposit") { deposits = money(deposits + t.amount); if (isDirect(t)) direct = money(direct + t.amount); delta = t.amount; }
      if (t.type === "expense") { spent = money(spent + t.amount); delta = -t.amount; }
      if (t.type === "transfer" && t.out) { moved = money(moved + t.amount); delta = -t.amount; }
      const fee = feeOf(t);
      fees = money(fees + fee);
      balance = money(balance + delta - fee);
      balances.set(t.id, balance);
    }
    closing = balance;
    if (m === month) stats = { carry, automaticCarry, manualCarry: Boolean(opening), deposits, direct, autoBase: money(carry + deposits - direct), income: money(carry + deposits), spent, moved, fees, remaining: balance };
  }
  return { stats, balances };
}

/**
 * Budget for a sub-category: its share of auto-allocated money (carry + normal deposits),
 * plus direct deposits to it (or its group, split by share), plus/minus budget transfers.
 */
export function allocatedTo(txs: Tx[], month: string, autoBase: number, sub: string, pct: number, group?: { id: string; pct: number }) {
  const inMonth = txs.filter(t => t.date.slice(0, 7) === month);
  const adjusted = inMonth.filter(t => t.type === "transfer")
    .reduce((sum, t) => sum + (t.toSub === sub ? t.amount : 0) - (t.sub === sub ? t.amount : 0), 0);
  const direct = inMonth.filter(t => t.type === "deposit")
    .reduce((sum, t) => sum + (t.sub === sub ? t.amount : group && t.group === group.id && group.pct > 0 ? t.amount * pct / group.pct : 0), 0);
  return money(autoBase * pct / 100 + adjusted + direct);
}

/** Money spent from a sub-category: expenses plus transfers that left the account into it. */
export function spentFrom(txs: Tx[], month: string, sub: string) {
  return money(txs.filter(t => t.date.slice(0, 7) === month)
    .reduce((sum, t) => sum + ((t.type === "expense" && t.sub === sub) || (t.type === "transfer" && t.out && t.toSub === sub) ? t.amount : 0), 0));
}

export function isTransaction(value: unknown): value is Tx {
  if (!value || typeof value !== "object") return false;
  const t = value as Partial<Tx>;
  return typeof t.id === "string" && ["deposit", "expense", "transfer", "carryover"].includes(t.type ?? "")
    && typeof t.amount === "number" && Number.isFinite(t.amount) && t.amount >= 0
    && typeof t.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.date)
    && typeof t.note === "string" && (t.fee === undefined || (Number.isFinite(t.fee) && t.fee >= 0))
    && (t.out === undefined || typeof t.out === "boolean")
    && (t.group === undefined || typeof t.group === "string")
    && (t.type !== "transfer" || (typeof t.sub === "string" && typeof t.toSub === "string" && t.sub !== t.toSub));
}
