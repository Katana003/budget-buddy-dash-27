export type Tx = {
  id: string;
  type: "deposit" | "expense" | "transfer" | "carryover";
  amount: number;
  sub?: string;
  toSub?: string;
  note: string;
  date: string;
  fee?: number;
};

export const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const feeOf = (t: Tx) => Number.isFinite(t.fee) ? (t.fee ?? 0) : 0;

export function calculateLedger(txs: Tx[], month: string) {
  const months = [...new Set([...txs.map(t => t.date.slice(0, 7)), month])].sort();
  const balances = new Map<string, number>();
  let closing = 0;
  let stats = { carry: 0, automaticCarry: 0, manualCarry: false, deposits: 0, income: 0, spent: 0, fees: 0, remaining: 0 };
  for (const m of months) {
    const entries = txs.filter(t => t.date.slice(0, 7) === m);
    const opening = entries.find(t => t.type === "carryover");
    const automaticCarry = closing;
    const carry = opening?.amount ?? automaticCarry;
    let balance = carry;
    let deposits = 0, spent = 0, fees = 0;
    if (opening) balances.set(opening.id, carry);
    for (const t of entries.filter(t => t.type !== "carryover").sort((a, b) => a.date.localeCompare(b.date))) {
      if (t.type === "deposit") deposits = money(deposits + t.amount);
      if (t.type === "expense") spent = money(spent + t.amount);
      const fee = t.type === "transfer" ? 0 : feeOf(t);
      fees = money(fees + fee);
      balance = money(balance + (t.type === "deposit" ? t.amount : t.type === "expense" ? -t.amount : 0) - fee);
      balances.set(t.id, balance);
    }
    closing = balance;
    if (m === month) stats = { carry, automaticCarry, manualCarry: Boolean(opening), deposits, income: money(carry + deposits), spent, fees, remaining: balance };
  }
  return { stats, balances };
}

export function allocatedTo(txs: Tx[], month: string, income: number, sub: string, pct: number) {
  const adjusted = txs.filter(t => t.type === "transfer" && t.date.slice(0, 7) === month)
    .reduce((sum, t) => sum + (t.toSub === sub ? t.amount : 0) - (t.sub === sub ? t.amount : 0), 0);
  return money(income * pct / 100 + adjusted);
}

export function isTransaction(value: unknown): value is Tx {
  if (!value || typeof value !== "object") return false;
  const t = value as Partial<Tx>;
  return typeof t.id === "string" && ["deposit", "expense", "transfer", "carryover"].includes(t.type ?? "")
    && typeof t.amount === "number" && Number.isFinite(t.amount) && t.amount >= 0
    && typeof t.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.date)
    && typeof t.note === "string" && (t.fee === undefined || (Number.isFinite(t.fee) && t.fee >= 0))
    && (t.type !== "transfer" || (typeof t.sub === "string" && typeof t.toSub === "string" && t.sub !== t.toSub));
}