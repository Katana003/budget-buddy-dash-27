import { useEffect, useMemo, useState } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

const USER = "XhizoStrike";
const PASS = "Timetable#2026";
const AUTH_KEY = "ledger-auth";
const DATA_KEY = "ledger-tx";

// Sub-category shares are a percentage of the whole deposit (they sum to each group's share).
const GROUPS = [
  { id: "needs", name: "Needs & Bills", pct: 50, color: "var(--chart-1)", subs: [
    { id: "rent", name: "Rent", pct: 25 }, { id: "food", name: "Food", pct: 15 }, { id: "internet", name: "Internet", pct: 10 } ] },
  { id: "wants", name: "Luxury & Wants", pct: 20, color: "var(--chart-2)", subs: [
    { id: "debt", name: "Debt", pct: 10 }, { id: "shopping", name: "Shopping", pct: 5 }, { id: "entertainment", name: "Entertainment", pct: 5 } ] },
  { id: "savings", name: "Savings & Assets", pct: 30, color: "var(--chart-3)", subs: [
    { id: "mmf", name: "MMF (Money Market Fund)", pct: 15 }, { id: "sinking", name: "Sinking Funds", pct: 15 } ] },
];
const SUBS = GROUPS.flatMap((g) => g.subs.map((s) => ({ ...s, group: g.name })));
const subName = (id?: string) => SUBS.find((s) => s.id === id)?.name ?? "—";

type Tx = { id: string; type: "deposit" | "expense"; amount: number; sub?: string; note: string; date: string };

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthOf = (d: string) => d.slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);
const monthLabel = (m: string) => new Date(m + "-01T00:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" });
const shiftMonth = (m: string, n: number) => { const d = new Date(m + "-01T00:00:00"); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 7); };

export function ExpenseApp() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  useEffect(() => { setAuthed(localStorage.getItem(AUTH_KEY) === "1"); setReady(true); }, []);
  if (!ready) return <div className="min-h-screen bg-background" />;
  return authed
    ? <Dashboard onLogout={() => { localStorage.removeItem(AUTH_KEY); setAuthed(false); }} />
    : <Login onLogin={() => { localStorage.setItem(AUTH_KEY, "1"); setAuthed(true); }} />;
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [u, setU] = useState(""); const [p, setP] = useState(""); const [err, setErr] = useState("");
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4" style={{ backgroundImage: "radial-gradient(circle at 30% 20%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 50%)" }}>
      <form onSubmit={(e) => { e.preventDefault(); if (u === USER && p === PASS) onLogin(); else setErr("Invalid username or password."); }}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Ledger</p>
        <h1 className="mt-2 font-display text-3xl font-bold">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to your premium dashboard.</p>
        <label className="mt-6 block text-sm text-muted-foreground">Username
          <input className={inputCls} value={u} onChange={(e) => setU(e.target.value)} autoFocus /></label>
        <label className="mt-4 block text-sm text-muted-foreground">Password
          <input type="password" className={inputCls} value={p} onChange={(e) => setP(e.target.value)} /></label>
        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
        <button className="mt-6 w-full rounded-lg bg-primary py-2.5 font-semibold text-primary-foreground hover:opacity-90">Sign in</button>
      </form>
    </div>
  );
}

const inputCls = "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground outline-none focus:border-ring";

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [modal, setModal] = useState<null | "deposit" | "expense">(null);
  const [charts, setCharts] = useState(false);
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");

  useEffect(() => { try { setTxs(JSON.parse(localStorage.getItem(DATA_KEY) || "[]")); } catch {} setLoaded(true); }, []);
  useEffect(() => { if (loaded) localStorage.setItem(DATA_KEY, JSON.stringify(txs)); }, [txs, loaded]);

  // Carry-over: remaining balance of every earlier month rolls into the next.
  const stats = useMemo(() => {
    const months = Array.from(new Set([...txs.map((t) => monthOf(t.date)), month])).sort();
    let carry = 0; let result = { carry: 0, deposits: 0, income: 0, spent: 0, remaining: 0 };
    for (const m of months) {
      if (m > month) break;
      const mt = txs.filter((t) => monthOf(t.date) === m);
      const deposits = mt.filter((t) => t.type === "deposit").reduce((a, t) => a + t.amount, 0);
      const spent = mt.filter((t) => t.type === "expense").reduce((a, t) => a + t.amount, 0);
      const income = carry + deposits;
      result = { carry, deposits, income, spent, remaining: income - spent };
      carry = Math.max(0, income - spent);
    }
    return result;
  }, [txs, month]);

  const monthTx = txs.filter((t) => monthOf(t.date) === month);
  const spentBy = (sub: string) => monthTx.filter((t) => t.type === "expense" && t.sub === sub).reduce((a, t) => a + t.amount, 0);
  const history = [...txs].filter((t) => (!from || t.date >= from) && (!to || t.date <= to)).sort((a, b) => b.date.localeCompare(a.date));
  const low = stats.remaining < 200;

  const add = (t: Omit<Tx, "id">) => { setTxs((x) => [...x, { ...t, id: crypto.randomUUID() }]); setModal(null); };

  const reportRows = () => {
    const alloc = SUBS.map((s) => [s.group, s.name, `${s.pct}%`, fmt(stats.income * s.pct / 100), fmt(spentBy(s.id)), fmt(stats.income * s.pct / 100 - spentBy(s.id))]);
    const tx = [...monthTx].sort((a, b) => a.date.localeCompare(b.date)).map((t) => [t.date, t.type, subName(t.sub), t.note, fmt(t.amount)]);
    return { alloc, tx };
  };
  const downloadCSV = () => {
    const { alloc, tx } = reportRows();
    const q = (r: string[]) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",");
    const lines = [`Monthly Report,${monthLabel(month)}`, `Carry-over,${fmt(stats.carry)}`, `Deposits,${fmt(stats.deposits)}`, `Total Income,${fmt(stats.income)}`, `Total Spent,${fmt(stats.spent)}`, `Remaining,${fmt(stats.remaining)}`, "",
      q(["Group", "Sub-category", "Share", "Allocated", "Spent", "Left"]), ...alloc.map(q), "", q(["Date", "Type", "Sub-category", "Note", "Amount"]), ...tx.map(q)];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `report-${month}.csv`; a.click();
  };
  const downloadPDF = () => {
    const { alloc, tx } = reportRows();
    const tbl = (h: string[], rows: string[][]) => `<table><tr>${h.map((c) => `<th>${c}</th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>`;
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>Report ${month}</title><style>body{font-family:sans-serif;padding:24px}table{border-collapse:collapse;width:100%;margin:12px 0 24px}td,th{border:1px solid #ccc;padding:6px;text-align:left;font-size:12px}</style></head><body>
      <h1>Monthly Report — ${monthLabel(month)}</h1>
      <p>Carry-over: ${fmt(stats.carry)} · Deposits: ${fmt(stats.deposits)} · Income: ${fmt(stats.income)} · Spent: ${fmt(stats.spent)} · Remaining: ${fmt(stats.remaining)}</p>
      <h2>Allocations</h2>${tbl(["Group", "Sub-category", "Share", "Allocated", "Spent", "Left"], alloc)}
      <h2>Transactions</h2>${tbl(["Date", "Type", "Sub-category", "Note", "Amount"], tx)}</body></html>`);
    w.document.close(); w.focus(); w.print();
  };

  const pieData = SUBS.map((s) => ({ name: s.name, value: spentBy(s.id) })).filter((d) => d.value > 0);
  const barData = GROUPS.map((g) => ({ name: g.name, Allocated: stats.income * g.pct / 100, Spent: g.subs.reduce((a, s) => a + spentBy(s.id), 0) }));
  const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div><p className="text-xs uppercase tracking-[0.3em] text-primary">Ledger</p><h1 className="font-display text-2xl font-bold">Hi, {USER}</h1></div>
          <div className="flex items-center gap-2">
            <button onClick={() => setMonth(shiftMonth(month, -1))} className={ghost}>‹</button>
            <span className="min-w-36 text-center font-medium">{monthLabel(month)}</span>
            <button onClick={() => setMonth(shiftMonth(month, 1))} className={ghost}>›</button>
            <button onClick={onLogout} className={ghost}>Log out</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-6 pt-8">
        <div className="flex flex-wrap gap-3">
          <button onClick={() => setModal("deposit")} className="rounded-xl bg-success px-6 py-3 text-lg font-bold text-success-foreground shadow-lg hover:opacity-90">+ Deposit</button>
          <button onClick={() => setModal("expense")} className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground hover:opacity-90">Add Expense</button>
          <button onClick={() => setCharts(!charts)} className={ghost}>{charts ? "Hide charts" : "View charts"}</button>
          <div className="ml-auto flex gap-2">
            <button onClick={downloadCSV} className={ghost}>Download CSV</button>
            <button onClick={downloadPDF} className={ghost}>Download PDF</button>
          </div>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Carried over" value={stats.carry} hint="From previous months" />
          <Stat label="Total Income" value={stats.income} hint={`Deposits ${fmt(stats.deposits)}`} />
          <Stat label="Total Spent" value={stats.spent} />
          <div className={`rounded-2xl border p-5 ${low ? "border-destructive bg-destructive/15" : "border-border bg-card"}`}>
            <p className="text-sm text-muted-foreground">Remaining Balance</p>
            <p className={`mt-2 font-display text-3xl font-bold ${low ? "text-destructive" : "text-success"}`}>{fmt(stats.remaining)}</p>
            {low && <p className="mt-1 text-xs font-semibold text-destructive">Low balance — below 200</p>}
          </div>
        </section>

        {charts && (
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-display text-lg font-bold">Spending breakdown</h3>
              {pieData.length ? (
                <ResponsiveContainer width="100%" height={280}><PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} stroke="none">
                    {pieData.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}</Pie>
                  <Tooltip contentStyle={tip} /><Legend /></PieChart></ResponsiveContainer>
              ) : <p className="py-24 text-center text-muted-foreground">No expenses this month yet.</p>}
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-display text-lg font-bold">Allocated vs spent</h3>
              <ResponsiveContainer width="100%" height={280}><BarChart data={barData}>
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} /><YAxis stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={tip} cursor={{ fill: "var(--accent)" }} /><Legend />
                <Bar dataKey="Allocated" fill="var(--chart-1)" radius={[6, 6, 0, 0]} /><Bar dataKey="Spent" fill="var(--chart-5)" radius={[6, 6, 0, 0]} />
              </BarChart></ResponsiveContainer>
            </div>
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-3">
          {GROUPS.map((g) => {
            const total = stats.income * g.pct / 100; const spent = g.subs.reduce((a, s) => a + spentBy(s.id), 0);
            return (
              <div key={g.id} className="rounded-2xl border border-border bg-card p-5" style={{ borderTop: `3px solid ${g.color}` }}>
                <div className="flex items-baseline justify-between"><h3 className="font-display text-xl font-bold">{g.name}</h3><span className="text-sm text-muted-foreground">{g.pct}%</span></div>
                <p className="mt-1 text-sm text-muted-foreground">Subtotal <span className="font-semibold text-foreground">{fmt(total)}</span> · Spent {fmt(spent)}</p>
                <div className="mt-4 space-y-4">
                  {g.subs.map((s) => {
                    const a = stats.income * s.pct / 100; const sp = spentBy(s.id); const pct = a ? Math.min(100, sp / a * 100) : 0; const over = sp > a;
                    return (
                      <div key={s.id}>
                        <div className="flex justify-between text-sm"><span>{s.name} <span className="text-muted-foreground">({s.pct}%)</span></span><span className="text-muted-foreground">{fmt(a)}</span></div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: over ? "var(--destructive)" : g.color }} /></div>
                        <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>Spent {fmt(sp)}</span><span className={over ? "text-destructive" : ""}>Left {fmt(a - sp)}</span></div>
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
              <label className="text-muted-foreground">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} /></label>
              <label className="text-muted-foreground">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} /></label>
              <button onClick={() => { setFrom(""); setTo(""); }} className={ghost}>Clear</button>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-2">Date</th><th>Type</th><th>Sub-category</th><th>Note</th><th className="text-right">Amount</th><th /></tr></thead>
              <tbody>
                {history.map((t) => (
                  <tr key={t.id} className="border-b border-border/60">
                    <td className="py-2.5">{t.date}</td>
                    <td><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t.type === "deposit" ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"}`}>{t.type}</span></td>
                    <td>{t.type === "deposit" ? "Auto 50/20/30" : subName(t.sub)}</td>
                    <td className="text-muted-foreground">{t.note}</td>
                    <td className={`text-right font-semibold ${t.type === "deposit" ? "text-success" : ""}`}>{t.type === "deposit" ? "+" : "−"}{fmt(t.amount)}</td>
                    <td className="text-right"><button onClick={() => setTxs((x) => x.filter((y) => y.id !== t.id))} className="text-muted-foreground hover:text-destructive" aria-label="Delete">✕</button></td>
                  </tr>
                ))}
                {!history.length && <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">No transactions yet — make a deposit to get started.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {modal && <TxModal kind={modal} defaultDate={month === today().slice(0, 7) ? today() : month + "-01"} onClose={() => setModal(null)} onSave={add} />}
    </div>
  );
}

const ghost = "rounded-lg border border-border bg-secondary px-3 py-2 text-sm hover:bg-accent";
const tip = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" };

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl font-bold">{fmt(value)}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TxModal({ kind, defaultDate, onClose, onSave }: { kind: "deposit" | "expense"; defaultDate: string; onClose: () => void; onSave: (t: Omit<Tx, "id">) => void }) {
  const [amount, setAmount] = useState(""); const [sub, setSub] = useState<string>(SUBS[0]!.id); const [note, setNote] = useState(""); const [date, setDate] = useState(defaultDate);
  const n = parseFloat(amount);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (n > 0) onSave({ type: kind, amount: n, ...(kind === "expense" ? { sub } : {}), note, date }); }}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <h2 className="font-display text-2xl font-bold">{kind === "deposit" ? "New deposit" : "Add expense"}</h2>
        <label className="mt-4 block text-sm text-muted-foreground">Amount<input type="number" step="0.01" min="0" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} /></label>
        {kind === "expense" && (
          <label className="mt-3 block text-sm text-muted-foreground">Sub-category
            <select value={sub} onChange={(e) => setSub(e.target.value)} className={inputCls}>
              {GROUPS.map((g) => <optgroup key={g.id} label={g.name}>{g.subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}
            </select></label>
        )}
        <label className="mt-3 block text-sm text-muted-foreground">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></label>
        <label className="mt-3 block text-sm text-muted-foreground">Note<input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder={kind === "deposit" ? "Salary" : "Groceries"} /></label>
        {kind === "deposit" && n > 0 && (
          <div className="mt-4 space-y-1 rounded-lg bg-muted p-3 text-xs">
            {GROUPS.map((g) => <div key={g.id} className="flex justify-between"><span>{g.name} ({g.pct}%)</span><span className="font-semibold">{fmt(n * g.pct / 100)}</span></div>)}
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={ghost}>Cancel</button>
          <button className={`rounded-lg px-4 py-2 font-semibold ${kind === "deposit" ? "bg-success text-success-foreground" : "bg-primary text-primary-foreground"}`}>Save</button>
        </div>
      </form>
    </div>
  );
}
