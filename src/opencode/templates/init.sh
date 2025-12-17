#!/bin/bash
#
# init.sh - Development Environment Initialization Script
# 
# This script sets up and starts the development environment.
# Run this at the start of every coding session.
#
# Usage: ./init.sh
#

set -e  # Exit on any error

# =============================================================================
# Configuration
# =============================================================================

PROJECT_NAME="PROJECT_NAME"
DEV_PORT=3000
# Add other configuration variables as needed

# =============================================================================
# Color Output Helpers
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# =============================================================================
# Prerequisite Checks
# =============================================================================

check_prerequisites() {
    info "Checking prerequisites..."
    
    # Check for required tools (customize based on your stack)
    # Example for Node.js project:
    # if ! command -v node &> /dev/null; then
    #     error "Node.js is required but not installed."
    #     exit 1
    # fi
    
    # Example for Python project:
    # if ! command -v python3 &> /dev/null; then
    #     error "Python 3 is required but not installed."
    #     exit 1
    # fi
    
    success "Prerequisites check passed"
}

# =============================================================================
# Dependency Installation
# =============================================================================

install_dependencies() {
    info "Checking dependencies..."
    
    # Node.js example:
    # if [ -f "package.json" ]; then
    #     if [ ! -d "node_modules" ]; then
    #         info "Installing npm dependencies..."
    #         npm install
    #     else
    #         info "Dependencies already installed"
    #     fi
    # fi
    
    # Python example:
    # if [ -f "requirements.txt" ]; then
    #     info "Installing Python dependencies..."
    #     pip install -r requirements.txt
    # fi
    
    success "Dependencies ready"
}

# =============================================================================
# Environment Setup
# =============================================================================

setup_environment() {
    info "Setting up environment..."
    
    # Load environment variables if .env exists
    if [ -f ".env" ]; then
        info "Loading .env file..."
        export $(grep -v '^#' .env | xargs)
    fi
    
    # Set development-specific variables
    export NODE_ENV=development
    # export DEBUG=true
    # export DATABASE_URL=...
    
    success "Environment configured"
}

# =============================================================================
# Database Setup (if applicable)
# =============================================================================

setup_database() {
    info "Checking database..."
    
    # Example: Run migrations
    # npm run migrate
    # python manage.py migrate
    
    # Example: Seed development data
    # npm run seed
    # python manage.py loaddata dev_fixtures
    
    success "Database ready"
}

# =============================================================================
# Start Development Server
# =============================================================================

start_server() {
    info "Starting development server..."
    
    echo ""
    echo "=============================================="
    echo " $PROJECT_NAME Development Server"
    echo "=============================================="
    echo ""
    echo " Server will be available at:"
    echo " → http://localhost:$DEV_PORT"
    echo ""
    echo " Press Ctrl+C to stop the server"
    echo ""
    echo "=============================================="
    echo ""
    
    # Node.js example:
    # npm run dev
    
    # Python/Django example:
    # python manage.py runserver 0.0.0.0:$DEV_PORT
    
    # Python/Flask example:
    # flask run --host=0.0.0.0 --port=$DEV_PORT
    
    # Go example:
    # go run main.go
    
    # For now, just echo that server would start
    # REPLACE THIS with your actual server start command
    warn "No server start command configured - edit init.sh"
    warn "Add your server start command in the start_server() function"
}

# =============================================================================
# Cleanup Handler
# =============================================================================

cleanup() {
    echo ""
    info "Shutting down..."
    # Add cleanup commands here (kill background processes, etc.)
    success "Cleanup complete"
}

trap cleanup EXIT

# =============================================================================
# Main
# =============================================================================

main() {
    echo ""
    echo "=============================================="
    echo " Initializing: $PROJECT_NAME"
    echo "=============================================="
    echo ""
    
    check_prerequisites
    install_dependencies
    setup_environment
    # setup_database  # Uncomment if using a database
    start_server
}

main "$@"
