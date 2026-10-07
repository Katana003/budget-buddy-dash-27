import { describe, expect, it } from "vitest";
import { allocatedTo, calculateLedger, isTransaction, type Tx } from "../lib/ledger";

const deposit: Tx = { id: "d", type: "deposit", amount: 1000, date: "2026-09-01", note: "", fee: 10 };
describe("Ledger adjustments", () => {
  it("transfers allocations without changing cash, income or spending", () => {
    const txs: Tx[] = [deposit, { id: "t", type: "transfer", amount: 100, sub: "debt", toSub: "mmf", date: "2026-09-02", note: "" }];
    const { stats, balances } = calculateLedger(txs, "2026-09");
    expect(stats.remaining).toBe(990);
    expect(stats.spent).toBe(0);
    expect(balances.get("t")).toBe(990);
    expect(allocatedTo(txs, "2026-09", stats.income, "debt", 10)).toBe(0);
    expect(allocatedTo(txs, "2026-09", stats.income, "mmf", 15)).toBe(250);
  });
  it("replaces automatic carry-over and rolls corrected closing forward", () => {
    const txs: Tx[] = [deposit, { id: "c", type: "carryover", amount: 500, date: "2026-10-01", note: "" }, { id: "e", type: "expense", amount: 100, date: "2026-10-02", sub: "food", note: "", fee: 5 }];
    const { stats, balances } = calculateLedger(txs, "2026-10");
    expect(stats.automaticCarry).toBe(990);
    expect(stats.carry).toBe(500);
    expect(stats.remaining).toBe(395);
    expect(balances.get("e")).toBe(395);
    expect(calculateLedger(txs, "2026-11").stats.carry).toBe(395);
    expect(calculateLedger(txs.filter(t => t.id !== "c"), "2026-10").stats.carry).toBe(990);
  });
  it("handles explicit zero carry-over and rejects invalid stored data", () => {
    const txs: Tx[] = [deposit, { id: "c", type: "carryover", amount: 0, date: "2026-10-01", note: "" }];
    expect(calculateLedger(txs, "2026-10").stats.carry).toBe(0);
    expect(isTransaction({ ...deposit, amount: Infinity })).toBe(false);
    expect(isTransaction(deposit)).toBe(true);
  });
});