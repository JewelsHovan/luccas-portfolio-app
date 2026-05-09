# Luccas Portfolio App — Justfile
# https://github.com/casey/just

set dotenv-load := true

# ─── Config ───────────────────────────────────────────────────────────────────
frontend_dir := "frontend"
backend_dir  := "backend"

# ─── Default: show available recipes ──────────────────────────────────────────
default:
    @just --list

# ─── Setup ────────────────────────────────────────────────────────────────────
# Install all dependencies (root + frontend + backend)
install:
    npm install
    cd {{frontend_dir}} && npm install
    cd {{backend_dir}} && npm install

# ─── Development ──────────────────────────────────────────────────────────────
# Run frontend dev server (Vite)
dev-frontend:
    cd {{frontend_dir}} && npm run dev

# Run backend dev server (Express with watch)
dev-backend:
    cd {{backend_dir}} && npm run dev

# Run both frontend and backend concurrently
dev:
    npx concurrently \
        --names "FRONTEND,BACKEND" \
        --prefix-colors "cyan.bold,green.bold" \
        "just dev-frontend" \
        "just dev-backend"

# ─── Build & Preview ──────────────────────────────────────────────────────────
# Build production frontend bundle
build:
    cd {{frontend_dir}} && npm run build

# Preview production build locally
preview: build
    cd {{frontend_dir}} && npm run preview

# ─── Code Quality ─────────────────────────────────────────────────────────────
# Lint frontend code
lint:
    cd {{frontend_dir}} && npm run lint

# ─── Backend ──────────────────────────────────────────────────────────────────
# Start backend in production mode
start:
    cd {{backend_dir}} && npm start

# Kill any process running on the backend port
stop:
    @echo "Killing process on port 5001..."
    @lsof -ti:5001 | xargs kill -9 2>/dev/null || echo "No process found on port 5001"

# ─── Cloudflare Worker ────────────────────────────────────────────────────────
# Deploy worker to Cloudflare (uses wrangler)
deploy:
    cd {{backend_dir}} && npx wrangler deploy

# Tail Cloudflare Worker logs
tail:
    cd {{backend_dir}} && npx wrangler tail

# Run worker locally via Wrangler (uses worker-fixed.js)
worker-dev:
    cd {{backend_dir}} && npx wrangler dev

# ─── Utilities ────────────────────────────────────────────────────────────────
# Clean build artifacts and node_modules
clean:
    rm -rf {{frontend_dir}}/dist
    rm -rf {{frontend_dir}}/node_modules
    rm -rf {{backend_dir}}/node_modules
    rm -rf node_modules
    rm -f package-lock.json {{frontend_dir}}/package-lock.json {{backend_dir}}/package-lock.json

# Full reset: clean + reinstall
reset: clean install

# Show project structure (tree-like, excluding node_modules)
tree:
    @tree -I 'node_modules|dist' -L 3

# Show outdated packages in all directories
outdated:
    @echo "=== Root ==="
    npm outdated || true
    @echo "\n=== Frontend ==="
    cd {{frontend_dir}} && npm outdated || true
    @echo "\n=== Backend ==="
    cd {{backend_dir}} && npm outdated || true
