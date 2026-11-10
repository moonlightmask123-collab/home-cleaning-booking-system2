> **UPDATE:** This version adds login security (token based), slot availability limits, booking cancellation, an admin panel (`/admin.html`) and a `.env` settings file. See **DEPLOY.md** for setup and online hosting. The viva notes below still apply; MySQL password is now set in `.env` (not inside `server.js`).

# HOME CLEANING BOOKING SLOT SYSTEM

## PART 1 — Project Overview
Home Cleaning Booking Slot System is a web application for booking cleaning slots online. Busy people often depend on phone calls and manual record books, which causes delays. This system lets users register, log in, choose a service, pick a date and time slot, and view their bookings at any time.

## PART 2 — Technologies Used
- **HTML5** – page structure
- **CSS3** – custom colours and animation
- **Bootstrap 5** – responsive navbar, cards, forms, tables, alerts
- **JavaScript** – validation, fetch() calls, login state, navbar changes
- **Node.js + Express.js** – small backend with 5 REST API routes
- **MySQL** – permanent storage of users and bookings
- **bcryptjs** – password hashing
(No PHP anywhere in the project.)

## PART 3 — Folder Structure
```
HomeCleaning/
├── index.html  register.html  login.html  services.html
├── booking.html  booking-history.html  profile.html
├── css/style.css
├── js/script.js
├── server.js
├── package.json
└── database/home_cleaning.sql
```
Parts 4–15 (SQL, package.json, server.js, all HTML, CSS, JS) are the actual files in this folder.

## PART 16 — How to Install Dependencies
1. Install Node.js (LTS) from https://nodejs.org
2. Open the `HomeCleaning` folder in a terminal.
3. Run: `npm install`  (installs express, mysql2, cors, bcryptjs)

## PART 17 — MySQL Setup
1. Install MySQL (MySQL Server + Workbench, or XAMPP/WAMP only for its MySQL and phpMyAdmin tools — no PHP code is used).
2. Open MySQL Workbench or phpMyAdmin.
3. Import / run `database/home_cleaning.sql`. It creates the database `home_cleaning`, then the `users` and `bookings` tables.
4. **Enter your MySQL password in `server.js`**: find the line `password: 'YOUR_MYSQL_PASSWORD'` (near the top, in the `mysql.createPool` block) and replace the text with your real root password. If root has no password, use `''`.

## PART 18 — How to Run the Project
1. Open a terminal in the `HomeCleaning` folder.
2. Run: `node server.js`
3. You should see: `Server running at http://localhost:3000`
4. Open **http://localhost:3000** in the browser. Always use this address (not by double-clicking the HTML files), so that fetch() reaches the Express server.

## PART 19 — Testing Procedure
1. Open http://localhost:3000 (home page).
2. Click **Register**.
3. Enter: Rahul, rahul@gmail.com, 9876543210, 123456, 123456, Hyderabad.
4. Click Register → "Registration successful!" → redirected to Login.
5. Open MySQL/phpMyAdmin and run `SELECT * FROM users;`
6. Confirm the Rahul row exists. The password column shows a long hash starting with `$2a$`, not `123456`.
7. Try registering the same email again → "Email already registered."
8. Go to Login, enter rahul@gmail.com / 123456 → opens Services. (A wrong password shows "Invalid email or password.")
9. On Services click **Book Now** on any card → booking page opens with that service selected.
10. Choose a date, a time slot, enter the address, click **Confirm Booking**.
11. "Booking confirmed successfully!" and a booking summary appear.
12. Open **Booking History** → the booking is listed.
13. Run `SELECT * FROM bookings;` → the row is there with the correct `user_id` and status `Confirmed`.
14. Open **Profile** → name, email, phone, address are shown.
15. Click **Logout** → redirected to Login; the navbar shows Login/Register again.

## PART 20 — Complete Project Working
```
User → HTML/CSS/Bootstrap page → JavaScript → fetch() → Node.js + Express → MySQL → Response → Page shows result
```
1. **Registration:** The user fills the form. JavaScript checks every field. If valid, fetch() sends the data to `POST /api/register`. Express checks whether the email exists, hashes the password, and inserts a row into `users`. The page shows "Registration successful!" and goes to login.
2. **Login:** JavaScript sends email and password to `POST /api/login`. Express finds the user by email and compares the password with the stored hash. If correct, it returns the user's id, name and email, which JavaScript saves in localStorage. The user goes to Services.
3. **How MySQL stores credentials:** Each user is one row in the `users` table (id, name, email, phone, password hash, address). Data stays even after the server is restarted.
4. **Password hashing:** bcrypt turns "123456" into a long scrambled text (hash) that cannot be turned back. At login, bcrypt hashes the typed password again and checks whether it matches the stored hash. Even the database owner cannot read the real password.
5. **Booking:** The booking page reads the logged-in user's id from localStorage, validates the form, and sends it to `POST /api/bookings`. Express inserts a row into `bookings` with status "Confirmed".
6. **Booking history:** JavaScript calls `GET /api/bookings/:userId`. Express selects only the rows where `user_id` equals that user's id, and JavaScript shows them in a Bootstrap table. If there are none, it shows "No bookings found."
7. **Frontend ↔ backend:** The frontend uses `fetch()` to send HTTP requests with JSON data. The backend replies with JSON, and JavaScript updates the page.
8. **Why Node.js:** It lets us write JavaScript on both frontend and backend, it is light, and Express makes APIs very short.
9. **Why PHP is not used:** The project is built with a pure JavaScript stack (Node.js), so one language is enough. Node.js handles the work PHP would do.
10. **Overall:** HTML/CSS/Bootstrap design the pages, JavaScript handles actions and validation, Express provides the API, MySQL stores the data permanently.

## PART 21 — Viva Questions and Answers
1. **What is HTML?** The markup language used to create the structure of web pages.
2. **What is CSS?** A language used to style web pages (colours, fonts, layout).
3. **What is Bootstrap?** A CSS framework with ready-made responsive components like navbar, cards and forms.
4. **What is JavaScript?** A programming language that makes web pages interactive.
5. **What is Node.js?** A runtime that lets JavaScript run outside the browser, on the server.
6. **What is Express.js?** A Node.js framework that makes creating servers and API routes easy.
7. **What is MySQL?** A relational database that stores data in tables.
8. **What is npm?** Node Package Manager, used to install libraries such as express and mysql2.
9. **What is an API?** A set of URLs through which the frontend and backend exchange data.
10. **What is a REST API?** An API that uses HTTP methods (GET, POST) on URLs to work with data.
11. **What is fetch()?** A JavaScript function used to send requests to the server and get responses.
12. **Why is Node.js used?** To connect the frontend to MySQL using JavaScript only.
13. **Why is PHP not used?** The project uses Node.js and Express instead, so a separate language is not needed.
14. **How does registration work?** The form data is validated, sent to /api/register, and saved in the users table.
15. **How does login work?** Email and password are sent to /api/login; the server checks them against MySQL and returns the user id.
16. **How are passwords stored?** As bcrypt hashes, never as plain text.
17. **What is bcrypt?** A library that converts passwords into secure hashes and compares them later.
18. **What is a primary key?** A column that uniquely identifies each row (here, `id`).
19. **What is a foreign key?** A column that links to another table's primary key (here, `bookings.user_id` → `users.id`).
20. **How are bookings stored?** The booking form is sent to /api/bookings and inserted into the bookings table.
21. **How is booking history displayed?** JavaScript calls /api/bookings/:userId and shows the returned rows in a table.
22. **What does express.json() do?** It reads JSON sent in the request body so the server can use it.
23. **What is CORS?** A browser rule for cross-origin requests; the cors package allows them.
24. **What is localStorage used for?** To remember the logged-in user in the browser; logout clears it.
25. **What does `?` in an SQL query mean?** It is a placeholder that safely inserts values and prevents SQL injection.
