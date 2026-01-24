#!/bin/bash

# Setup Test Database Script
# Single command to setup everything for local testing
# Usage: npm run db:test:setup

set -e

echo "🔧 PR Manager - Test Database Setup"
echo "===================================="

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

CONTAINER_NAME="pr-manager-db"
DB_NAME="pr_manager_test"
DB_USER="postgres"
DB_PASSWORD="postgres"
DB_PORT="5432"

# Step 1: Check if Docker is running
echo -e "${YELLOW}Step 1: Checking Docker...${NC}"
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}✗ Docker is not running${NC}"
  echo "Please start Docker Desktop and try again."
  exit 1
fi
echo -e "${GREEN}✓ Docker is running${NC}"

# Step 2: Start PostgreSQL container if not running
echo -e "${YELLOW}Step 2: Setting up PostgreSQL container...${NC}"
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo -e "${GREEN}✓ Container '$CONTAINER_NAME' is already running${NC}"
else
  # Check if container exists but is stopped
  if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Starting existing container..."
    docker start $CONTAINER_NAME
  else
    echo "Creating new PostgreSQL container..."
    docker run -d \
      --name $CONTAINER_NAME \
      -e POSTGRES_USER=$DB_USER \
      -e POSTGRES_PASSWORD=$DB_PASSWORD \
      -e POSTGRES_DB=$DB_NAME \
      -p $DB_PORT:5432 \
      --health-cmd="pg_isready -U postgres" \
      --health-interval=5s \
      --health-timeout=3s \
      --health-retries=5 \
      postgres:15-alpine
  fi

  # Wait for container to be healthy
  echo "Waiting for PostgreSQL to be ready..."
  for i in {1..30}; do
    if docker exec $CONTAINER_NAME pg_isready -U $DB_USER > /dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  echo -e "${GREEN}✓ PostgreSQL is ready${NC}"
fi

# Step 3: Recreate test database
echo -e "${YELLOW}Step 3: Setting up test database...${NC}"
docker exec $CONTAINER_NAME psql -U $DB_USER -c "DROP DATABASE IF EXISTS $DB_NAME WITH (FORCE);" 2>/dev/null || true
docker exec $CONTAINER_NAME psql -U $DB_USER -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || true
echo -e "${GREEN}✓ Database '$DB_NAME' ready${NC}"

# Step 4: Run Prisma migrations
echo -e "${YELLOW}Step 4: Running Prisma migrations...${NC}"
export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${DB_PORT}/${DB_NAME}?schema=public"
npx prisma migrate deploy
echo -e "${GREEN}✓ Migrations applied${NC}"

# Step 5: Generate Prisma client
echo -e "${YELLOW}Step 5: Generating Prisma client...${NC}"
npx prisma generate
echo -e "${GREEN}✓ Prisma client generated${NC}"

echo ""
echo -e "${GREEN}✅ Test database setup complete!${NC}"
echo ""
echo "Run tests with:"
echo "  npm test"
echo ""
echo "DATABASE_URL=$DATABASE_URL"
