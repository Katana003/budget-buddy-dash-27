import { Button } from "@/components/ui/button";
import { ArrowRightLeft, Pencil, Save, Undo2, Wand2 } from "lucide-react";
import { allocatedTo, calculateLedger, feeOf, isTransaction, money, spentFrom, type Tx } from "@/lib/ledger";
import { useEffect, useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const USER = "XhizoStrike";
const PASS = "Timetable#2026";
const AUTH_KEY = "ledger-auth";
const DATA_KEY = "ledger-tx";
const BACKUP_KEY = "ledger-tx-saved";

// Sub-category shares are a percentage of the whole deposit (they sum to each group's share).
const GROUPS = [
  {
    id: "needs",
    name: "Needs & Bills",
    pct: 50,
    color: "var(--chart-1)",
    subs: [
      { id: "rent", name: "Rent", pct: 25 },
      { id: "food", name: "Food", pct: 15 },
      { id: "internet", name: "Internet", pct: 10 },
    ],
  },
  {
    id: "wants",
    name: "Luxury & Wants",
    pct: 20,
    color: "var(--chart-2)",
    subs: [
      { id: "debt", name: "Debt", pct: 10 },
      { id: "shopping", name: "Shopping", pct: 5 },
      { id: "entertainment", name: "Entertainment", pct: 5 },
    ],
  },
  {
    id: "savings",
    name: "Savings & Assets",
    pct: 30,
    color: "var(--chart-3)",
    subs: [
      { id: "mmf", name: "MMF (Money Market Fund)", pct: 15 },
      { id: "sinking", name: "Sinking Funds", pct: 15 },
    ],
  },
];
const SUBS = GROUPS.flatMap((g) => g.subs.map((s) => ({ ...s, group: g.name })));
const subName = (id?: string) => SUBS.find((s) => s.id === id)?.name ?? "—";
const groupOfSub = (id: string) => GROUPS.find((g) => g.subs.some((s) => s.id === id));

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const fmt = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthOf = (d: string) => d.slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);
const monthLabel = (m: string) =>
  new Date(m + "-01T00:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" });
const shiftMonth = (m: string, n: number) => {
  const d = new Date(m + "-01T00:00:00");
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export function ExpenseApp() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    setAuthed(localStorage.getItem(AUTH_KEY) === "1");
    setReady(true);
  }, []);
  if (!ready) return <div className="min-h-screen bg-background" />;
  return authed ? (
    <Dashboard
      onLogout={() => {
        localStorage.removeItem(AUTH_KEY);
        setAuthed(false);
      }}
    />
  ) : (
    <Login
      onLogin={() => {
        localStorage.setItem(AUTH_KEY, "1");
        setAuthed(true);
      }}
    />
  );
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background px-4"
      style={{
        backgroundImage:
          "radial-gradient(circle at 30% 20%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 50%)",
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (u === USER && p === PASS) onLogin();
          else setErr("Invalid username or password.");
        }}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-2xl"
      >
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Ledger</p>
        <h1 className="mt-2 font-display text-3xl font-bold">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to your premium dashboard.</p>
        <label className="mt-6 block text-sm text-muted-foreground">
          Username
          <input className={inputCls} value={u} onChange={(e) => setU(e.target.value)} autoFocus />
        </label>
        <label className="mt-4 block text-sm text-muted-foreground">
          Password
          <input
            type="password"
            className={inputCls}
            value={p}
            onChange={(e) => setP(e.target.value)}
          />
        </label>
        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
        <Button className="mt-6 w-full rounded-lg bg-primary py-2.5 font-semibold text-primary-foreground hover:opacity-90">
          Sign in
        </Button>
      </form>
    </div>
  );
}

const inputCls =
  "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground outline-none focus:border-ring";

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [modal, setModal] = useState<null | "deposit" | "expense" | "transfer" | "carryover">(null);
  const [editing, setEditing] = useState<Tx | null>(null);
  const [charts, setCharts] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [savedAt, setSavedAt] = useState("");

  useEffect(() => {
    const read = (key: string) => {
      try {
        const v = JSON.parse(localStorage.getItem(key) || "null");
        return Array.isArray(v) ? v.filter(isTransaction) : null;
      } catch {
        return null; // ignore corrupt data
      }
    };
    // Fall back to the last manual save if the live copy is missing or corrupt.
    setTxs(read(DATA_KEY) ?? read(BACKUP_KEY) ?? []);
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) localStorage.setItem(DATA_KEY, JSON.stringify(txs));
  }, [txs, loaded]);
  const saveNow = () => {
    const data = JSON.stringify(txs);
    localStorage.setItem(DATA_KEY, data);
    localStorage.setItem(BACKUP_KEY, data);
    setSavedAt(new Date().toLocaleTimeString());
  };

  const { stats, balances } = useMemo(() => calculateLedger(txs, month), [txs, month]);
  const monthTx = txs.filter((t) => monthOf(t.date) === month);
  const spentBy = (sub: string) => spentFrom(txs, month, sub);
  const allocation = (sub: string, pct: number) => {
    const g = groupOfSub(sub);
    return allocatedTo(txs, month, stats.autoBase, sub, pct, g && { id: g.id, pct: g.pct });
  };
  const available = (sub: string) => {
    const category = SUBS.find(s => s.id === sub);
    return category ? money(allocation(sub, category.pct) - spentBy(sub)) : 0;
  };
  const categoryLabel = (t: Tx) => t.type === "deposit" ? (t.sub ? `Direct → ${subName(t.sub)}` : t.group ? `Direct → ${GROUPS.find(g => g.id === t.group)?.name ?? "—"}` : "Auto 50/20/30") : t.type === "carryover" ? "Opening balance" : t.type === "transfer" ? `${subName(t.sub)} → ${subName(t.toSub)}${t.out ? " (left account)" : ""}` : subName(t.sub);
  const sweep = () => {
    const date = month === today().slice(0, 7) ? today() : month + "-28";
    const moves = SUBS.filter((s) => s.id !== "mmf" && s.id !== "sinking")
      .map((s) => ({ s, left: available(s.id) })).filter((x) => x.left >= 0.01);
    if (!moves.length) { window.alert("No unspent budget to sweep this month."); return; }
    const total = money(moves.reduce((a, x) => a + x.left, 0));
    if (!window.confirm(`Move ${fmt(total)} of unspent budget from ${moves.length} categories into MMF? (Budget only — your account cash does not change.)`)) return;
    setTxs((x) => [...x, ...moves.map(({ s, left }) => ({ id: newId(), type: "transfer" as const, amount: left, sub: s.id, toSub: "mmf", note: "Month-end sweep of leftovers", date }))]);
  };
  const history = [...txs]
    .filter((t) => (!from || t.date >= from) && (!to || t.date <= to))
    .sort((a, b) => b.date.localeCompare(a.date));
  const low = stats.remaining < 200;

  const add = (t: Omit<Tx, "id">) => {
    setTxs((x) => [...x.filter(old => t.type !== "carryover" || old.type !== "carryover" || monthOf(old.date) !== monthOf(t.date)), { ...t, id: newId() }]);
    setModal(null);
    setEditing(null);
  };
  const update = (t: Tx) => {
    setTxs((x) => [...x.filter(old => old.id === t.id || old.type !== "carryover" || t.type !== "carryover" || monthOf(old.date) !== monthOf(t.date)), t]);
    setModal(null);
    setEditing(null);
  };
  const closeModal = () => {
    setModal(null);
    setEditing(null);
  };
  const openEdit = (t: Tx) => {
    setEditing(t);
    setModal(t.type);
  };

  const reportRows = () => {
    const alloc = SUBS.map((s) => [
      s.group,
      s.name,
      `${s.pct}%`,
      fmt(allocation(s.id, s.pct)),
      fmt(spentBy(s.id)),
      fmt(allocation(s.id, s.pct) - spentBy(s.id)),
    ]);
    const tx = [...monthTx]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t) => [
        t.date,
        t.type,
        categoryLabel(t),
        t.note,
        fmt(t.amount),
        fmt(feeOf(t)),
        fmt(balances.get(t.id) ?? 0),
      ]);
    return { alloc, tx };
  };
  const downloadCSV = () => {
    const { alloc, tx } = reportRows();
    const q = (r: string[]) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",");
    const lines = [
      `Monthly Report,${monthLabel(month)}`,
      `Carry-over,${fmt(stats.carry)}`,
      `Deposits,${fmt(stats.deposits)}`,
      `Total Income,${fmt(stats.income)}`,
      `Total Spent,${fmt(stats.spent)}`,
      `Transaction Costs,${fmt(stats.fees)}`,
      `Remaining,${fmt(stats.remaining)}`,
      "",
      q(["Group", "Sub-category", "Share", "Allocated", "Spent", "Left"]),
      ...alloc.map(q),
      "",
      q(["Date", "Type", "Sub-category", "Note", "Amount", "Transaction Cost", "Account Balance"]),
      ...tx.map(q),
    ];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `report-${month}.csv`;
    a.click();
  };
  const downloadPDF = () => {
    const { alloc, tx } = reportRows();
    const tbl = (h: string[], rows: string[][]) =>
      `<table><tr>${h.map((c) => `<th>${c}</th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document
      .write(`<html><head><title>Report ${month}</title><style>body{font-family:sans-serif;padding:24px}table{border-collapse:collapse;width:100%;margin:12px 0 24px}td,th{border:1px solid #ccc;padding:6px;text-align:left;font-size:12px}</style></head><body>
      <h1>Monthly Report — ${monthLabel(month)}</h1>
      <p>Carry-over: ${fmt(stats.carry)} · Deposits: ${fmt(stats.deposits)} · Income: ${fmt(stats.income)} · Spent: ${fmt(stats.spent)} · Transaction costs: ${fmt(stats.fees)} · Remaining: ${fmt(stats.remaining)}</p>
      <h2>Allocations</h2>${tbl(["Group", "Sub-category", "Share", "Allocated", "Spent", "Left"], alloc)}
      <h2>Transactions</h2>${tbl(["Date", "Type", "Sub-category", "Note", "Amount", "Transaction Cost", "Account Balance"], tx)}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const pieData = SUBS.map((s) => ({ name: s.name, value: spentBy(s.id) })).filter(
    (d) => d.value > 0,
  );
  const barData = GROUPS.map((g) => ({
    name: g.name,
    Allocated: g.subs.reduce((sum, s) => sum + allocation(s.id, s.pct), 0),
    Spent: g.subs.reduce((a, s) => a + spentBy(s.id), 0),
  }));
  const colors = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
  ];

  return (
    <div className="min-h-screen pb-16">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-primary">Ledger</p>
            <h1 className="font-display text-2xl font-bold">Hi, {USER}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setMonth(shiftMonth(month, -1))} className={ghost}>
              ‹
            </Button>
            <span className="min-w-36 text-center font-medium">{monthLabel(month)}</span>
            <Button onClick={() => setMonth(shiftMonth(month, 1))} className={ghost}>
              ›
            </Button>
            <Button onClick={onLogout} className={ghost}>
              Log out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-6 pt-8">
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => setModal("deposit")}
            className="rounded-xl bg-success px-6 py-3 text-lg font-bold text-success-foreground shadow-lg hover:opacity-90"
          >
            + Deposit
          </Button>
          <Button
            onClick={() => setModal("expense")}
            className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground hover:opacity-90"
          >
            Add Expense
          </Button>
          <Button variant="secondary" onClick={() => setModal("transfer")} className={ghost}>
            <ArrowRightLeft /> Transfer budget
          </Button>
          <Button onClick={sweep} className={ghost} title="Move all unspent budget into MMF">
            <Wand2 /> Sweep leftovers
          </Button>
          <Button onClick={() => setCharts(!charts)} className={ghost}>
            {charts ? "Hide charts" : "View charts"}
          </Button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {savedAt && <span className="text-xs text-success">Saved {savedAt}</span>}
            <Button onClick={saveNow} className="rounded-lg bg-success px-3 py-2 text-sm font-semibold text-success-foreground hover:opacity-90">
              <Save /> Save
            </Button>
            <Button onClick={downloadCSV} className={ghost}>
              Download CSV
            </Button>
            <Button onClick={downloadPDF} className={ghost}>
              Download PDF
            </Button>
            <Button
              onClick={() => {
                if (
                  window.confirm(
                    "Reset everything? This permanently deletes all deposits, expenses, budget transfers and manual carry-over balances.",
                  )
                ) {
                  setTxs([]);
                  localStorage.removeItem(BACKUP_KEY);
                  setSavedAt("");
                  setFrom("");
                  setTo("");
                  setMonth(today().slice(0, 7));
                }
              }}
              className="rounded-lg border border-destructive/60 bg-destructive/15 px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/25"
            >
              Reset
            </Button>
          </div>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative rounded-2xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">Carried over</p>
            <p className="mt-2 font-display text-3xl font-bold">{fmt(stats.carry)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{stats.manualCarry ? "Manual opening balance" : "From previous months"}</p>
            <Button variant="ghost" size="icon" className="absolute right-2 top-2 text-primary" aria-label="Edit carry-over" title="Edit carry-over" onClick={() => setModal("carryover")}><Pencil /></Button>
          </div>
          <Stat
            label="Total Income"
            value={stats.income}
            hint={`Deposits ${fmt(stats.deposits)}`}
          />
          <Stat label="Total Spent" value={money(stats.spent + stats.moved)} hint={stats.moved ? `Incl. ${fmt(stats.moved)} sent out (e.g. MMF)` : undefined} />
          <Stat label="Transaction Costs" value={stats.fees} hint="Fees & charges this month" />
          <div
            className={`rounded-2xl border p-5 ${low ? "border-destructive bg-destructive/15" : "border-border bg-card"}`}
          >
            <p className="text-sm text-muted-foreground">Remaining Balance</p>
            <p
              className={`mt-2 font-display text-3xl font-bold ${low ? "text-destructive" : "text-success"}`}
            >
              {fmt(stats.remaining)}
            </p>
            {low && (
              <p className="mt-1 text-xs font-semibold text-destructive">Low balance — below 200</p>
            )}
          </div>
        </section>

        {charts && (
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-display text-lg font-bold">Spending breakdown</h3>
              {pieData.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={100}
                      stroke="none"
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={colors[i % colors.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tip} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-24 text-center text-muted-foreground">
                  No expenses this month yet.
                </p>
              )}
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-display text-lg font-bold">Allocated vs spent</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={barData}>
                  <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip contentStyle={tip} cursor={{ fill: "var(--accent)" }} />
                  <Legend />
                  <Bar dataKey="Allocated" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Spent" fill="var(--chart-5)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-3">
          {GROUPS.map((g) => {
            const total = money(g.subs.reduce((sum, s) => sum + allocation(s.id, s.pct), 0));
            const spent = g.subs.reduce((a, s) => a + spentBy(s.id), 0);
            return (
              <div
                key={g.id}
                className="rounded-2xl border border-border bg-card p-5"
                style={{ borderTop: `3px solid ${g.color}` }}
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="font-display text-xl font-bold">{g.name}</h3>
                  <span className="text-sm text-muted-foreground">{g.pct}%</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Subtotal <span className="font-semibold text-foreground">{fmt(total)}</span> ·
                  Spent {fmt(spent)}
                </p>
                <div className="mt-4 space-y-4">
                  {g.subs.map((s) => {
                    const a = allocation(s.id, s.pct);
                    const sp = spentBy(s.id);
                    const pct = a > 0 ? Math.max(0, Math.min(100, (sp / a) * 100)) : sp > 0 ? 100 : 0;
                    const over = sp > a;
                    return (
                      <div key={s.id}>
                        <div className="flex justify-between text-sm">
                          <span>
                            {s.name} <span className="text-muted-foreground">({s.pct}%)</span>
                          </span>
                          <span className="text-muted-foreground">{fmt(a)}</span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              background: over ? "var(--destructive)" : g.color,
                            }}
                          />
                        </div>
                        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                          <span>Spent {fmt(sp)}</span>
                          <span className={over ? "text-destructive" : ""}>Left {fmt(a - sp)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h3 className="font-display text-xl font-bold">Transaction history</h3>
            <div className="flex flex-wrap items-end gap-2 text-sm">
              <label className="text-muted-foreground">
                From
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="text-muted-foreground">
                To
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className={inputCls}
                />
              </label>
              <Button
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
                className={ghost}
              >
                Clear
              </Button>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2">Date</th>
                  <th>Type</th>
                  <th>Sub-category</th>
                  <th>Note</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Transaction Cost</th>
                  <th className="text-right">Account Balance</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {history.map((t) => (
                  <tr key={t.id} className="border-b border-border/60">
                    <td className="py-2.5">{t.date}</td>
                    <td>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t.type === "deposit" ? "bg-success/20 text-success" : t.type === "expense" ? "bg-destructive/20 text-destructive" : "bg-primary/15 text-primary"}`}
                      >
                        {t.type}
                      </span>
                    </td>
                    <td>{categoryLabel(t)}</td>
                    <td className="text-muted-foreground">{t.note}</td>
                    <td
                      className={`text-right font-semibold ${t.type === "deposit" ? "text-success" : ""}`}
                    >
                      {t.type === "deposit" ? "+" : t.type === "expense" || t.out ? "−" : ""}
                      {fmt(t.amount)}
                    </td>
                    <td className="text-right text-muted-foreground">
                      {feeOf(t) ? `−${fmt(feeOf(t))}` : "—"}
                    </td>
                    <td
                      className={`text-right font-semibold ${(balances.get(t.id) ?? 0) < 0 ? "text-destructive" : "text-primary"}`}
                    >
                      {fmt(balances.get(t.id) ?? 0)}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <Button variant="ghost" size="icon" aria-label="Edit entry" title="Edit entry"
                        className="text-muted-foreground hover:text-primary"
                        onClick={() => openEdit(t)}>
                        <Pencil />
                      </Button>
                      {t.type === "transfer" && (
                        <Button variant="ghost" size="icon" aria-label="Undo transfer" title="Undo transfer"
                          className="text-muted-foreground hover:text-primary"
                          onClick={() => window.confirm("Undo this transfer? Budgets (and cash, if it left the account) go back to how they were.") && setTxs((x) => x.filter((y) => y.id !== t.id))}>
                          <Undo2 />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => window.confirm("Delete this entry permanently?") && setTxs((x) => x.filter((y) => y.id !== t.id))}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Delete"
                      >
                        ✕
                      </Button>
                    </td>
                  </tr>
                ))}
                {!history.length && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-muted-foreground">
                      No transactions yet — make a deposit to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {(modal === "transfer" || modal === "carryover") && (
        <AdjustmentModal kind={modal} month={month} carry={stats.carry} automaticCarry={stats.automaticCarry}
          manualCarry={stats.manualCarry} available={available} edit={editing} onClose={closeModal}
          onSave={editing ? (t) => update({ ...t, id: editing.id }) : add}
          onAutomatic={() => {
            const m = editing && editing.type === "carryover" ? monthOf(editing.date) : month;
            setTxs(x => x.filter(t => t.type !== "carryover" || monthOf(t.date) !== m));
            closeModal();
          }} />
      )}
      {(modal === "deposit" || modal === "expense") && (
        <TxModal
          kind={modal}
          defaultDate={month === today().slice(0, 7) ? today() : month + "-01"}
          edit={editing}
          onClose={closeModal}
          onSave={editing ? (t) => update({ ...t, id: editing.id }) : add}
        />
      )}
    </div>
  );
}

const ghost = "rounded-lg border border-border bg-secondary! px-3 py-2 text-sm text-secondary-foreground! hover:bg-accent!";
const tip = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--foreground)",
};

function Stat({ label, value, hint }: { label: string; value: number; hint?: string | undefined }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl font-bold">{fmt(value)}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TxModal({
  kind,
  defaultDate,
  edit,
  onClose,
  onSave,
}: {
  kind: "deposit" | "expense";
  defaultDate: string;
  edit?: Tx | null;
  onClose: () => void;
  onSave: (t: Omit<Tx, "id">) => void;
}) {
  const [amount, setAmount] = useState(edit ? String(edit.amount) : "");
  const [sub, setSub] = useState<string>(edit?.sub ?? SUBS[0]?.id ?? "rent");
  const [note, setNote] = useState(edit?.note ?? "");
  const [date, setDate] = useState(edit?.date ?? defaultDate);
  const [fee, setFee] = useState(edit?.fee ? String(edit.fee) : "");
  const [target, setTarget] = useState(edit ? (edit.sub ? `s:${edit.sub}` : edit.group ? `g:${edit.group}` : "auto") : "auto");
  const f = parseFloat(fee) || 0;
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const n = parseFloat(amount);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/80 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (Number.isFinite(n) && n >= 0.01 && Number.isFinite(f) && f >= 0 && date)
            onSave({
              type: kind,
              amount: Math.round(n * 100) / 100,
              fee: Math.round(f * 100) / 100,
              ...(kind === "expense" ? { sub } : {}),
              ...(kind === "deposit" && target.startsWith("s:") ? { sub: target.slice(2) } : {}),
              ...(kind === "deposit" && target.startsWith("g:") ? { group: target.slice(2) } : {}),
              note,
              date,
            });
        }}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <h2 className="font-display text-2xl font-bold">
          {kind === "deposit" ? "New deposit" : "Add expense"}
        </h2>
        <label className="mt-4 block text-sm text-muted-foreground">
          Amount
          <input
            type="number"
            step="0.01"
            min="0"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputCls}
          />
        </label>
        {kind === "deposit" && (
          <label className="mt-3 block text-sm text-muted-foreground">
            Deposit to
            <select value={target} onChange={(e) => setTarget(e.target.value)} className={inputCls}>
              <option value="auto">Auto-split 50/20/30</option>
              <optgroup label="Whole category">
                {GROUPS.map((g) => <option key={g.id} value={`g:${g.id}`}>{g.name}</option>)}
              </optgroup>
              <optgroup label="Single budget">
                {SUBS.map((s) => <option key={s.id} value={`s:${s.id}`}>{s.name}</option>)}
              </optgroup>
            </select>
          </label>
        )}
        {kind === "expense" && (
          <label className="mt-3 block text-sm text-muted-foreground">
            Sub-category
            <select value={sub} onChange={(e) => setSub(e.target.value)} className={inputCls}>
              {GROUPS.map((g) => (
                <optgroup key={g.id} label={g.name}>
                  {g.subs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}
        <label className="mt-3 block text-sm text-muted-foreground">
          Transaction cost (fees/charges)
          <input
            type="number"
            step="0.01"
            min="0"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            className={inputCls}
            placeholder="0.00"
          />
        </label>
        <label className="mt-3 block text-sm text-muted-foreground">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="mt-3 block text-sm text-muted-foreground">
          Note
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputCls}
            placeholder={kind === "deposit" ? "Salary" : "Groceries"}
          />
        </label>
        {kind === "deposit" && target !== "auto" && n > 0 && (
          <p className="mt-4 rounded-lg bg-muted p-3 text-xs">All {fmt(n)} goes to {target.startsWith("s:") ? subName(target.slice(2)) : GROUPS.find((g) => `g:${g.id}` === target)?.name} — no 50/20/30 split.</p>
        )}
        {kind === "deposit" && target === "auto" && n > 0 && (
          <div className="mt-4 space-y-1 rounded-lg bg-muted p-3 text-xs">
            {GROUPS.map((g) => (
              <div key={g.id} className="flex justify-between">
                <span>
                  {g.name} ({g.pct}%)
                </span>
                <span className="font-semibold">{fmt((n * g.pct) / 100)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" onClick={onClose} className={ghost}>
            Cancel
          </Button>
          <Button
            className={`rounded-lg px-4 py-2 font-semibold ${kind === "deposit" ? "bg-success text-success-foreground" : "bg-primary text-primary-foreground"}`}
          >
            Save
          </Button>
        </div>
      </form>
    </div>
  );
}

function AdjustmentModal({ kind, month, carry, automaticCarry, manualCarry, available, onClose, onSave, onAutomatic }: {
  kind: "transfer" | "carryover"; month: string; carry: number; automaticCarry: number;
  manualCarry: boolean; available: (sub: string) => number; onClose: () => void;
  onSave: (t: Omit<Tx, "id">) => void; onAutomatic: () => void;
}) {
  const [source, setSource] = useState("debt");
  const [target, setTarget] = useState("mmf");
  const [amount, setAmount] = useState(kind === "carryover" ? String(carry) : "");
  const [note, setNote] = useState("");
  const [fee, setFee] = useState("");
  const [out, setOut] = useState(false);
  const [error, setError] = useState("");
  const pastMonth = month < today().slice(0, 7);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onClose]);
  const transfer = kind === "transfer";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/80 px-4 py-6 backdrop-blur-sm" onClick={onClose}>
      <form role="dialog" aria-modal="true" aria-labelledby="adjustment-title" className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={e => e.stopPropagation()} onSubmit={e => {
          e.preventDefault();
          const n = money(Number(amount));
          if (!amount.trim() || !Number.isFinite(n) || n < (transfer ? 0.01 : 0)) { setError("Enter a valid amount."); return; }
          if (transfer && (source === target || n > available(source))) { setError(source === target ? "Choose two different budgets." : "The amount exceeds the source budget’s available balance."); return; }
          const f = money(Number(fee) || 0);
          if (transfer && (!Number.isFinite(f) || f < 0)) { setError("Enter a valid transaction cost."); return; }
          if (transfer && !note.trim()) { setError("Add a reason so you remember why this money moved."); return; }
          onSave({ type: kind, amount: n, date: transfer && month === today().slice(0, 7) ? today() : month + "-01", note: note.trim() || (transfer ? "Budget reallocation" : "Manual opening balance"), ...(transfer ? { sub: source, toSub: target, fee: f, out } : {}) });
        }}>
        <h2 id="adjustment-title" className="font-display text-2xl font-bold">{transfer ? "Transfer budget" : "Carry-over · " + monthLabel(month)}</h2>
        {transfer && <>
          <label className="mt-4 block text-sm text-muted-foreground">From budget
            <select className={inputCls} value={source} onChange={e => { setSource(e.target.value); setError(""); }}>
              {SUBS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <p className="mt-2 text-sm text-primary">Available {fmt(available(source))}</p>
          <label className="mt-3 block text-sm text-muted-foreground">To budget
            <select className={inputCls} value={target} onChange={e => { setTarget(e.target.value); setError(""); }}>
              {SUBS.filter(s => s.id !== source).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </>}
        <label className="mt-4 block text-sm text-muted-foreground">{transfer ? "Amount to transfer" : "Opening balance from last month"}
          <input className={inputCls} type="number" required min={transfer ? "0.01" : "0"} step="0.01" value={amount} onChange={e => { setAmount(e.target.value); setError(""); }} autoFocus />
        </label>
        {!transfer && <p className="mt-2 text-xs text-muted-foreground">Automatic carry-over: {fmt(automaticCarry)}</p>}
        {transfer && <>
          <label className="mt-3 block text-sm text-muted-foreground">Transaction cost (fees/charges)
            <input className={inputCls} type="number" min="0" step="0.01" placeholder="0.00" value={fee} onChange={e => { setFee(e.target.value); setError(""); }} />
          </label>
          <label className="mt-3 flex items-start gap-2 rounded-lg bg-muted p-3 text-sm">
            <input type="checkbox" className="mt-1 accent-[var(--primary)]" checked={out} onChange={e => setOut(e.target.checked)} />
            <span><span className="font-semibold">Money actually leaves my account</span><br /><span className="text-xs text-muted-foreground">Tick when you really sent it (e.g. to your MMF or to pay a debt). Leave unticked to only re-label the budget.</span></span>
          </label>
          {pastMonth && <p role="status" className="mt-3 rounded-lg border border-primary/40 bg-primary/10 p-2 text-xs text-primary">Heads up: you’re changing {monthLabel(month)}, a past month. Its report and the carry-over into later months may change.</p>}
        </>}
        <label className="mt-3 block text-sm text-muted-foreground">{transfer ? "Reason (required)" : "Note"}<input className={inputCls} value={note} onChange={e => { setNote(e.target.value); setError(""); }} placeholder={transfer ? "e.g. Friend still owes me, saving it instead" : ""} /></label>
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {!transfer && manualCarry && <Button type="button" variant="secondary" onClick={onAutomatic}>Use automatic</Button>}
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">{transfer ? "Transfer" : "Save carry-over"}</Button>
        </div>
      </form>
    </div>
  );
}
