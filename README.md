# Smart Budget Dashboard

Build an interactive, single-page Expense Tracker web application with a premium dark theme dashboard.

Authentication:
Login page accepting Username: XhizoStrike and Password: Timetable#2026.
Upon successful login, direct user to the Premium Theme Dashboard.

Deposit & Automatic Allocation Rule (50 / 20 / 30 Rule):
A prominent green "Deposit" button opens a modal to enter paid income/deposit.
Auto-allocate the deposit into three main categories and sub-categories:

Needs & Bills (50% of Deposit):
- Rent: 25% of Needs & Bills
- Food: 15% of Needs & Bills
- Internet: 10% of Needs & Bills

Luxury & Wants (20% of Deposit):
- Debt: 10% of Luxury & Wants
- Shopping: 5% of Luxury & Wants
- Entertainment: 5% of Luxury & Wants

Savings & Assets (30% of Deposit):
- MMF (Money Market Fund): 15% of Savings & Assets
- Sinking Funds: 15% of Savings & Assets

Expense Management & Real-time Totals:
- Display 3 main column cards showing allocations, subtotals, and spent amounts for each sub-category.
- "Add Expense" button opens a modal allowing users to log expenses tagged to specific sub-categories.
- Real-time balances: Compute Total Income, Total Used/Spent, and Remaining Balance.
- Low Balance Alert: Highlight remaining balance in red if it drops below 200.

Additional Features:
- Visual charts: A button/toggle to view visual charts of transactions and spending breakdown.
- Carry-over Balance: Rollover unused funds from the current month to the next month's starting balance.
- Monthly Report Download: Downloadable summary report (CSV/PDF) for monthly transactions and allocations.
- Transaction History: A visual table showing recent logs (Deposits & Expenses) with date filters.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://budget-buddy-dash-27.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7b9dd48c-6f64-48d8-ab23-2cf55e9afab6).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
