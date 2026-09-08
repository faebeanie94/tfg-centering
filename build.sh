#!/bin/bash
set -e

echo "Building frontend..."
npm run build

echo "Copying frontend build to server..."
rm -rf server/dist
cp -r dist server/

echo "Build complete!"
