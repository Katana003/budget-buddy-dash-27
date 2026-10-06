import { createFileRoute } from "@tanstack/react-router";
import { ExpenseApp } from "@/components/ExpenseApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ledger — Premium Expense Tracker" },
      { name: "description", content: "Track deposits and expenses with automatic 50/20/30 budgeting, charts and monthly reports." },
      { property: "og:title", content: "Ledger — Premium Expense Tracker" },
      { property: "og:description", content: "Automatic 50/20/30 budgeting, carry-over balances and monthly reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExpenseApp,
});
