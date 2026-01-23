#!/bin/bash

# Setup Test Database Script
# Creates a fresh test database with all migrations applied
# Use this locally or in CI/CD environments

set -e

echo "🔧 PR Manager - Test Database Setup"
echo "===================================="

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get database URL from environment or use default
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD:-}
DB_NAME="pr_manager_test"

# Build connection strings
if [ -z "$DB_PASSWORD" ]; then
  PSQL_CMD="psql -h $DB_HOST -p $DB_PORT -U $DB_USER"
else
  PSQL_CMD="PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER"
fi

echo -e "${YELLOW}Database Configuration:${NC}"
echo "Host: $DB_HOST:$DB_PORT"
echo "User: $DB_USER"
echo "Database: $DB_NAME"
echo ""

# Step 1: Check PostgreSQL connectivity
echo -e "${YELLOW}Step 1: Checking PostgreSQL connectivity...${NC}"
if $PSQL_CMD -tc "SELECT 1" > /dev/null 2>&1; then
  echo -e "${GREEN}✓ PostgreSQL is reachable${NC}"
else
  echo -e "${RED}✗ Cannot connect to PostgreSQL${NC}"
  echo "Make sure PostgreSQL is running:"
  echo "  Local: brew services start postgresql"
  echo "  Docker: docker run -e POSTGRES_PASSWORD=testpass -p 5432:5432 postgres:15"
  exit 1
fi

# Step 2: Drop existing test database
echo -e "${YELLOW}Step 2: Cleaning up existing test database...${NC}"
$PSQL_CMD -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 && {
  echo "Dropping existing test database '$DB_NAME'..."
  $PSQL_CMD -c "DROP DATABASE IF EXISTS $DB_NAME WITH (FORCE);"
  echo -e "${GREEN}✓ Old database dropped${NC}"
} || {
  echo "Database doesn't exist yet (first run)"
}

# Step 3: Create fresh test database
echo -e "${YELLOW}Step 3: Creating fresh test database...${NC}"
$PSQL_CMD -c "CREATE DATABASE $DB_NAME WITH ENCODING 'UTF8';"
echo -e "${GREEN}✓ Database '$DB_NAME' created${NC}"

# Step 4: Run Prisma migrations
echo -e "${YELLOW}Step 4: Running Prisma migrations...${NC}"
export DATABASE_URL="postgresql://${DB_USER}${DB_PASSWORD:+:$DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public"
npx prisma migrate deploy
echo -e "${GREEN}✓ Migrations applied${NC}"

# Step 5: Generate Prisma client
echo -e "${YELLOW}Step 5: Generating Prisma client...${NC}"
npx prisma generate
echo -e "${GREEN}✓ Prisma client generated${NC}"

# Step 6: Verify database
echo -e "${YELLOW}Step 6: Verifying database schema...${NC}"
TABLE_COUNT=$($PSQL_CMD -d $DB_NAME -tc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" | xargs)
echo "Tables created: $TABLE_COUNT"
if [ "$TABLE_COUNT" -gt 0 ]; then
  echo -e "${GREEN}✓ Database schema verified${NC}"

  # List tables
  echo ""
  echo "Tables in database:"
  $PSQL_CMD -d $DB_NAME -tc "\dt public.*" | awk '{print "  - " $0}'
else
  echo -e "${RED}✗ No tables found in database${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}✅ Test database setup complete!${NC}"
echo ""
echo "Ready to run tests:"
echo "  npm run test -w @pr-manager/backend"
echo ""
echo "Environment variable set:"
echo "  DATABASE_URL=$DATABASE_URL"
