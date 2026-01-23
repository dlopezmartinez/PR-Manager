@echo off
REM Setup Test Database Script for Windows
REM Creates a fresh test database with all migrations applied

setlocal enabledelayedexpansion

echo.
echo 🔧 PR Manager - Test Database Setup
echo ====================================
echo.

REM Configuration
set DB_HOST=%DB_HOST%localhost
set DB_PORT=%DB_PORT%5432
set DB_USER=%DB_USER%postgres
set DB_PASSWORD=%DB_PASSWORD%
set DB_NAME=pr_manager_test

if "%DB_HOST%"=="localhost" set DB_HOST=localhost
if "%DB_PORT%"=="5432" set DB_PORT=5432
if "%DB_USER%"=="postgres" set DB_USER=postgres

echo Database Configuration:
echo Host: %DB_HOST%:%DB_PORT%
echo User: %DB_USER%
echo Database: %DB_NAME%
echo.

REM Step 1: Check PostgreSQL connectivity
echo Step 1: Checking PostgreSQL connectivity...
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -tc "SELECT 1" > nul 2>&1
if errorlevel 1 (
  echo ✗ Cannot connect to PostgreSQL
  echo Make sure PostgreSQL is running
  exit /b 1
)
echo ✓ PostgreSQL is reachable
echo.

REM Step 2: Drop existing test database
echo Step 2: Cleaning up existing test database...
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -tc "SELECT 1 FROM pg_database WHERE datname = '%DB_NAME%'" | findstr /c:"1" > nul
if not errorlevel 1 (
  echo Dropping existing test database '%DB_NAME%'...
  psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -c "DROP DATABASE IF EXISTS %DB_NAME% WITH (FORCE);"
  echo ✓ Old database dropped
) else (
  echo Database doesn't exist yet (first run)
)
echo.

REM Step 3: Create fresh test database
echo Step 3: Creating fresh test database...
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -c "CREATE DATABASE %DB_NAME% WITH ENCODING 'UTF8';"
if errorlevel 1 (
  echo ✗ Failed to create database
  exit /b 1
)
echo ✓ Database '%DB_NAME%' created
echo.

REM Step 4: Run Prisma migrations
echo Step 4: Running Prisma migrations...
set DATABASE_URL=postgresql://%DB_USER%@%DB_HOST%:%DB_PORT%/%DB_NAME%?schema=public
if not "%DB_PASSWORD%"=="" (
  set DATABASE_URL=postgresql://%DB_USER%:%DB_PASSWORD%@%DB_HOST%:%DB_PORT%/%DB_NAME%?schema=public
)

npx prisma migrate deploy
if errorlevel 1 (
  echo ✗ Failed to run migrations
  exit /b 1
)
echo ✓ Migrations applied
echo.

REM Step 5: Generate Prisma client
echo Step 5: Generating Prisma client...
npx prisma generate
echo ✓ Prisma client generated
echo.

REM Step 6: Verify database
echo Step 6: Verifying database schema...
for /f "tokens=*" %%i in ('psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -tc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"') do set TABLE_COUNT=%%i

if %TABLE_COUNT% gtr 0 (
  echo Tables created: %TABLE_COUNT%
  echo ✓ Database schema verified
  echo.
  echo Tables in database:
  for /f "tokens=*" %%i in ('psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -tc "\dt public.*"') do echo   - %%i
) else (
  echo ✗ No tables found in database
  exit /b 1
)

echo.
echo ✅ Test database setup complete!
echo.
echo Ready to run tests:
echo   npm run test -w @pr-manager/backend
echo.
echo Environment variable set:
echo   DATABASE_URL=%DATABASE_URL%
echo.
