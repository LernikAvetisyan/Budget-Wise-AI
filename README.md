# BudgetWise AI

BudgetWise AI is a full-stack personal finance dashboard that helps users track transactions, budgets, savings goals, account activity, rewards, and AI-assisted financial insights. The project is connected to a companion simulated banking system, Freedom Bank, which generates realistic checking and credit card transaction data for safe demo usage.

## Features

- User signup, login, logout, and protected dashboard access
- Transaction tracking with income, expenses, categories, dates, and account sources
- Activity dashboard with financial KPI cards, recent transactions, filters, and spending breakdown charts
- Monthly budget tracking with category limits, progress bars, budget editing, and category-level transaction history
- Savings goal management with sections, goal progress, deposits, auto-deposit tracking, completed goals, and refund handling
- Spending Outlook section with activity, budget, and goal analytics
- AI-assisted financial summaries, spending outlook reports, goal analysis, and transaction drafting
- Rewards center with XP, streaks, daily tasks, levels, and mastery path progression
- Settings page with profile editing, password/username changes, notification preferences, and Freedom Bank connection controls
- Simulated bank sync using Freedom Bank checking and credit accounts

## Tech Stack

**Frontend**
- HTML
- CSS
- JavaScript
- Chart.js
- Font Awesome
- Lottie animations

**Backend**
- Node.js
- Express.js
- MySQL
- JWT authentication
- Cookie-based sessions
- OpenAI API
- Freedom Bank API integration

**Database**
- MySQL tables for users, transactions, accounts, budgets, goals, deposits, rewards, notifications, and AI summaries

## Project Architecture

BudgetWise AI uses an Express backend to serve a vanilla JavaScript frontend and provide authenticated REST API endpoints. After login, the browser sends cookie-authenticated requests to the backend. The backend verifies the user token, scopes data by user, and reads/writes financial records in MySQL.

Freedom Bank acts as a simulated banking provider. BudgetWise can connect to Freedom Bank, link checking and credit accounts separately, import simulated transactions, prevent duplicate imports, and keep account activity synchronized in the background.

## Main Sections

- **Dashboard:** Overview of balance, spending, alerts, recent transactions, and rotating Activity/Budgets/Goals summaries
- **Assistant AI:** Chat-style finance assistant for financial questions and transaction drafting
- **Activity:** Transaction feed, filters, spending breakdowns, and add-transaction tools
- **Budgets:** Category budgets, progress tracking, budget editing, and transaction drilldowns
- **Spending Outlook:** AI-assisted analytics for activity, budgets, cards, and goals
- **Goals:** Goal sections, deposit tracking, auto-deposit status, completed goals, and what-if analysis
- **Rewards:** XP, streaks, levels, daily financial tasks, and mastery path
- **Settings:** Profile, security, notifications, and Freedom Bank connection controls

## Important Note

This project is a personal finance and budgeting application using a simulated bank integration. It is not a real banking platform, payment processor, or production financial system.

## Resume Summary

Built a full-stack personal finance dashboard using Node.js, Express, MySQL, and vanilla JavaScript to track transactions, budgets, savings goals, account summaries, rewards, and AI-assisted financial analytics. Integrated a simulated Freedom Bank API with account linking, transaction imports, duplicate prevention, and background synchronization.