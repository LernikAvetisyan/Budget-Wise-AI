# BudgetWise AI

> Full-stack personal finance dashboard with transaction tracking, budgets, savings goals, AI-assisted insights, rewards, and simulated bank synchronization.

![Node.js](https://img.shields.io/badge/Backend-Node.js-green)
![Express](https://img.shields.io/badge/API-Express.js-black)
![MySQL](https://img.shields.io/badge/Database-MySQL-blue)
![JavaScript](https://img.shields.io/badge/Frontend-JavaScript-yellow)
![OpenAI](https://img.shields.io/badge/AI-OpenAI_API-purple)
![Chart.js](https://img.shields.io/badge/Charts-Chart.js-red)

---

## About

BudgetWise AI is a full-stack personal finance web application designed to help users track transactions, manage category-based budgets, create savings goals, view financial dashboards, and receive AI-assisted financial insights.

The project connects with a companion simulated banking system called **Freedom Bank**, which generates realistic checking and credit card activity for safe demo usage. BudgetWise AI can link simulated accounts, import transactions, prevent duplicates, and use the imported data for dashboards, budgets, goals, and analytics.

> This is an educational/demo personal finance project. It is not a real banking platform, payment processor, or production financial system.

---

## Why BudgetWise AI?

- **Transaction Tracking:** Track income, expenses, categories, dates, merchants, and account sources.
- **Budget Management:** Set category limits, monitor spending progress, and review category-level transaction history.
- **Goal Planning:** Create savings goals, schedule deposits, track progress, and review completed goals.
- **Simulated Bank Sync:** Import realistic checking and credit card transactions from Freedom Bank.
- **AI-Assisted Insights:** Generate financial summaries, spending outlooks, goal analysis, and what-if recommendations.
- **Gamification:** Encourage financial habits with XP, daily tasks, streaks, levels, and a mastery path.
- **Modern Dashboard:** Chart.js visualizations, KPI cards, alerts, filters, and dynamic dashboard panels.

---

## Features

| Area | Features |
|---|---|
| Authentication | Signup, login, logout, JWT cookie authentication, protected routes |
| Dashboard | Balance overview, account cards, financial chart, alerts, recent transactions, rotating Activity/Budgets/Goals panels |
| Activity | Transaction feed, income/expense filters, date/category/account filters, spending breakdown chart, manual transaction entry |
| Budgets | Category budgets, spending progress, edit/delete actions, category toggles, transaction drilldowns |
| Goals | Goal sections, goal limits, deposit schedules, manual/auto/missed/upcoming deposits, completed-goal history, refund handling |
| Spending Outlook | Activity, budget, card, and goal analytics with AI-generated reports |
| Assistant AI | Financial Q&A, transaction drafting, budget help, goal planning, quick prompts |
| Rewards | XP, streaks, daily tasks, bonus XP, 10-level progression, mastery path |
| Settings | Profile editing, username/password changes, notification preferences, Freedom Bank connection controls |
| Freedom Bank Sync | Account linking, checking/credit selection, transaction import, duplicate prevention, background sync |

---

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | HTML, CSS, JavaScript, Chart.js, Font Awesome, Lottie |
| Backend | Node.js, Express.js |
| Database | MySQL |
| Authentication | JWT, HttpOnly cookies |
| AI | OpenAI API |
| Integration | Freedom Bank API, Firebase Identity Toolkit / Secure Token endpoints |
| Data Access | `mysql2/promise`, parameterized SQL queries |

---

## Project Architecture

```text
Budgeting-Tracker/
├── backend/
│   ├── config/              # Database configuration
│   ├── controllers/         # Request handlers and business logic
│   ├── cron/                # Background Freedom Bank sync logic
│   ├── models/              # MySQL query models
│   ├── routes/              # Express route definitions
│   ├── utils/               # Utility helpers
│   ├── .env.example         # Example environment variables
│   ├── package.json
│   └── server.js            # Express server entry point
│
├── frontend/
│   ├── assets/              # Static assets
│   ├── loginpage/           # Login/signup pages
│   ├── sections/
│   │   ├── activity/        # Transaction activity UI
│   │   ├── assistant/       # AI assistant UI
│   │   ├── budgets/         # Budget management UI
│   │   ├── dashboard/       # Main dashboard UI
│   │   ├── goals/           # Savings goals UI
│   │   ├── outlook/         # Spending outlook analytics UI
│   │   ├── rewards/         # Rewards center UI
│   │   └── settings/        # Profile/settings UI
│   └── index.html           # SPA-style shell
│
├── MySQL scheme/            # Database schema files
├── .gitignore
└── README.md
```

---

## Main Application Sections

### Dashboard

The dashboard provides a high-level financial overview with balance cards, checking/credit account summaries, recent transactions, financial alerts, and rotating Activity/Budgets/Goals panels.

### Assistant AI

The AI assistant supports financial questions, budget help, goal planning, and transaction drafting. Some common financial questions are grounded in stored user data.

### Activity

The activity section displays transaction history with filters, financial KPI cards, spending breakdown charts, and add-transaction tools.

### Budgets

The budgets section tracks category-level spending against monthly limits, supports budget editing, and allows users to view transaction history for each category.

### Spending Outlook

The Spending Outlook section provides analytics for activity, budgets, cards, and goals. It includes charts, category summaries, and AI-generated analysis reports.

### Goals

The goals module supports savings sections, goal creation, deposit schedules, progress tracking, completed-goal history, refund handling, and what-if analysis.

### Rewards

The rewards center adds gamification through daily tasks, XP, streaks, levels, bonus rewards, and a mastery path.

### Settings

The settings page includes profile editing, password/username changes, notification preferences, and Freedom Bank account connection controls.

---

## Freedom Bank Integration

BudgetWise AI connects to **Freedom Bank**, a separate simulated banking project.

| Capability | Description |
|---|---|
| Bank Login | User signs in to the simulated Freedom Bank system |
| Account Selection | User can connect checking, credit card, or both |
| Transaction Import | Imported records are saved as BudgetWise transactions |
| Duplicate Prevention | Existing imported records are protected using external IDs |
| Background Sync | Connected accounts can be synchronized periodically |
| Disconnect Control | Users can disconnect Freedom Bank and stop transaction syncing |

This integration is simulated and is designed for demo/testing purposes only.

---

## AI Features

| Feature | Description |
|---|---|
| Finance Q&A | Ask questions about spending, income, balances, categories, and goals |
| Transaction Drafting | Create transaction drafts from natural-language input |
| Daily Summary | Generate dashboard-level financial summaries |
| Spending Outlook | Analyze activity, budgets, checking, credit, and goals |
| Goal What-If | Review goal scenarios and recommendations |

AI responses are intended for educational/demo insights only and should not be treated as professional financial advice.

---

## Security Notes

This project includes authentication and protected routes, but it is not production-ready.

Known limitations:

- Passwords should be hashed before any production use.
- Secrets must be stored in `.env` and never committed.
- `JWT_SECRET` should be set to a long private value.
- Refresh tokens and financial data require stronger production-grade protection.
- CSRF protection, rate limiting, and automated tests should be added before real deployment.

---

## Environment Variables

Create a real `.env` file inside `backend/` based on `backend/.env.example`.

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_mysql_username
DB_PASSWORD=your_mysql_password
DB_NAME=budgettracker

JWT_SECRET=replace_this_with_a_long_random_secret
FREEDOM_SERVER_API_KEY=your_freedom_bank_api_key
OPENAI_API_KEY=your_openai_api_key
```

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/LernikAvetisyan/Budget-Wise-AI.git
cd Budget-Wise-AI
```

### 2. Install backend dependencies

```bash
cd backend
npm install
```

### 3. Configure environment variables

```bash
copy .env.example .env
```

Then edit `backend/.env` with your local MySQL credentials, JWT secret, Freedom Bank key, and OpenAI API key.

### 4. Set up MySQL

Create the MySQL database and import the schema from the `MySQL scheme/` folder.

### 5. Start the server

```bash
node server.js
```

The app runs locally through the Express server.

---

## API Overview

| Route Group | Purpose |
|---|---|
| `/api/auth` | Signup, login, logout, current user, profile/security updates |
| `/api/activity` | Transaction listing, creation, editing, filtering, summaries |
| `/api/accounts` | Account data, Freedom Bank connection, account sync controls |
| `/api/budgets` | Budget categories, limits, spending progress |
| `/api/goals` | Goal sections, goal records, deposits, completion logic |
| `/api/rewards` | XP, daily tasks, streaks, reward progress |
| `/api/settings/notifications` | User notification preferences |
| `/api/assistant` | AI assistant and transaction drafting |
| `/api/ai` | AI summaries, outlook analysis, goal analysis |

---

## Resume Summary

Built a full-stack personal finance dashboard using Node.js, Express, MySQL, and vanilla JavaScript to track transactions, budgets, savings goals, account summaries, rewards, and AI-assisted financial analytics. Integrated a simulated Freedom Bank API with user-controlled account linking, transaction imports, duplicate prevention, and background synchronization.

---

## Disclaimer

BudgetWise AI is a student/portfolio project using simulated financial data. It is not a real banking system, real payment processor, or production-grade financial platform.
