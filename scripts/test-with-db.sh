#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔍 Checking Docker status...${NC}"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running.${NC}"
    echo -e "${YELLOW}   Please start Docker Desktop and try again.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker is running${NC}"

# Check if the container exists and is running
CONTAINER_NAME="pr-manager-db"
CONTAINER_STATUS=$(docker ps -a --filter "name=$CONTAINER_NAME" --format "{{.Status}}" 2>/dev/null)

if [ -z "$CONTAINER_STATUS" ]; then
    echo -e "${YELLOW}📦 Starting PostgreSQL container...${NC}"
    docker compose up -d
elif [[ ! "$CONTAINER_STATUS" == Up* ]]; then
    echo -e "${YELLOW}📦 Container exists but not running. Starting...${NC}"
    docker compose up -d
else
    echo -e "${GREEN}✓ PostgreSQL container is already running${NC}"
fi

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}⏳ Waiting for PostgreSQL to be ready...${NC}"
MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if docker exec $CONTAINER_NAME pg_isready -U postgres > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PostgreSQL is ready${NC}"
        break
    fi
    ATTEMPT=$((ATTEMPT + 1))
    if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
        echo -e "${RED}❌ PostgreSQL failed to start after $MAX_ATTEMPTS attempts${NC}"
        exit 1
    fi
    sleep 1
done

# Run Prisma migrations
echo -e "${YELLOW}🔄 Applying database migrations...${NC}"
cd packages/backend
npx prisma migrate deploy --schema=./prisma/schema.prisma 2>/dev/null || {
    echo -e "${YELLOW}   Running prisma db push instead...${NC}"
    npx prisma db push --schema=./prisma/schema.prisma --accept-data-loss 2>/dev/null
}
cd ../..

echo -e "${GREEN}✓ Database ready${NC}"
echo ""

# Run tests
echo -e "${YELLOW}🧪 Running backend tests...${NC}"
npm run test -w @pr-manager/backend
