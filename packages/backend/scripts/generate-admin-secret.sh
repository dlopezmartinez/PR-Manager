#!/bin/bash

# Generate a secure Admin Secret Key
# Usage: ./scripts/generate-admin-secret.sh

echo "🔐 Generating secure Admin Secret Key..."
echo ""

# Generate 32 random bytes and convert to base64
SECRET=$(openssl rand -base64 32)

echo "Your Admin Secret Key (keep this safe!):"
echo ""
echo "ADMIN_SECRET_KEY=\"$SECRET\""
echo ""
echo "Add this to your .env file:"
echo ""
echo "ADMIN_SECRET_KEY=$SECRET"
echo ""
echo "✅ Done! Use this secret in the Authorization header:"
echo "   Authorization: AdminSecret $SECRET"
