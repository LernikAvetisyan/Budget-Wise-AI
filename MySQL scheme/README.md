# MySQL Setup (Windows CMD)

This project uses a MySQL database named `budgettracker`. Follow the steps below to create the database and import the schema using Windows CMD.

1) Create the database (UTF-8, safe defaults)

"C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe" -u root -p -e "CREATE DATABASE IF NOT EXISTS budgettracker DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

2) Import the schema (schema-only, no user data)

"C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe" -u root -p budgettracker < "MySQL schema\budgettracker_schema1.sql"

3) Verify tables were created

"C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe" -u root -p -e "USE budgettracker; SHOW TABLES;"

Notes
- If your MySQL is installed in a different path, update the `mysql.exe` path accordingly.
- The schema file is located at: `MySQL schema\budgettracker_schema1.sql`
- This import creates tables, indexes, and constraints, but does not import any user transactions or other data.
