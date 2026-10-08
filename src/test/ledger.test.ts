import { describe, expect, it } from "vitest";
import { allocatedTo, calculateLedger, isTransaction, spentFrom, type Tx } from "../lib/ledger";

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
describe("Transfers out, fees and direct deposits", () => {
  it("deducts out-transfers and transfer fees from cash and counts them as spent in target", () => {
    const txs: Tx[] = [deposit, { id: "t", type: "transfer", amount: 100, sub: "debt", toSub: "mmf", out: true, fee: 2, date: "2026-09-02", note: "x" }];
    const { stats } = calculateLedger(txs, "2026-09");
    expect(stats.remaining).toBe(888);
    expect(stats.moved).toBe(100);
    expect(spentFrom(txs, "2026-09", "mmf")).toBe(100);
  });
  it("direct deposits skip the 50/20/30 split", () => {
    const txs: Tx[] = [{ id: "d", type: "deposit", amount: 300, sub: "mmf", date: "2026-09-01", note: "" }, { id: "g", type: "deposit", amount: 500, group: "needs", date: "2026-09-01", note: "" }];
    const { stats } = calculateLedger(txs, "2026-09");
    expect(stats.income).toBe(800);
    expect(stats.autoBase).toBe(0);
    expect(allocatedTo(txs, "2026-09", stats.autoBase, "mmf", 15, { id: "savings", pct: 30 })).toBe(300);
    expect(allocatedTo(txs, "2026-09", stats.autoBase, "rent", 25, { id: "needs", pct: 50 })).toBe(250);
  });
});
