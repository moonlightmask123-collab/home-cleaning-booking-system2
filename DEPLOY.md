# Setup & Deployment Guide

## A. Run on your own computer
1. Install **Node.js (LTS)** and **MySQL** (or XAMPP, only for its MySQL).
2. In this folder run: `npm install`
3. Copy `.env.example` to `.env` and put your MySQL password in `DB_PASSWORD`
   (XAMPP's root user has no password, so leave it empty). Also set `ADMIN_PASSWORD`.
4. Run: `node server.js`  → open http://localhost:3000
   The database and tables are created automatically on first start.

## B. Put it online (so anyone can use it)
Your project is a **Node.js** app, so it needs a host that runs Node.js plus a MySQL database.
Free PHP hosts such as InfinityFree (`*.fwh.is`) **cannot run Node.js**, so use a Node host instead,
for example Render or Railway, with a hosted MySQL (Railway MySQL, TiDB Cloud, Aiven, etc.).
Free plans change often - check each site's current free tier before choosing.

Steps (same on any Node host):
1. Upload this project to a GitHub repository (the `.gitignore` already keeps `node_modules` and `.env` out).
2. Create a hosted MySQL database and copy its connection link (`mysql://...`).
3. Create a new **Web Service** from your GitHub repo:
   - Build command: `npm install`
   - Start command: `node server.js`
4. Add these **Environment Variables** in the host's dashboard (instead of a .env file):
   - `DATABASE_URL` = the MySQL link from step 2
   - `DB_SSL` = `true` (if your MySQL host requires SSL)
   - `AUTH_SECRET` = a long random text
   - `ADMIN_PASSWORD` = your admin password
5. Deploy. Open the site URL. Check `/api/health` shows `{"ok":true}`.

## C. Pages
| Page | Who | Purpose |
|---|---|---|
| index, services | everyone | browse services |
| register, login | everyone | accounts |
| booking | logged-in users | choose service, date, slot (live availability) |
| booking-history | logged-in users | view / cancel own bookings |
| profile | logged-in users | own details |
| **admin.html** | owner only | all bookings, search, filter, set Confirmed / Completed / Cancelled |

## D. Change services, prices, slots
Edit the `SERVICES` and `SLOTS` lists near the top of `server.js` (the website updates automatically).
Change how many bookings each slot accepts with `SLOT_CAPACITY` in `.env`.
