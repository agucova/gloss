{ pkgs, lib, config, ... }:

{
  dotenv.enable = true;
  
  # Core packages for development
  packages = with pkgs; [
    bun
    nodejs_22
    jujutsu
    git
    jq
  ];

  # Environment variables for local development
  env = {
    # Database
    DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/gloss";

    # Auth
    BETTER_AUTH_SECRET = "devenv-local-secret-min-32-chars-long";
    BETTER_AUTH_URL = "http://localhost:3000";

    # Server
    NODE_ENV = "development";
    PORT = "3000";

    # URLs (VITE_ prefix makes them available to Vite client builds)
    VITE_SERVER_URL = "http://localhost:3000";
    VITE_WEB_URL = "http://localhost:3001";
  };

  # PostgreSQL service with pgvector for semantic search
  services.postgres = {
    enable = true;
    listen_addresses = "127.0.0.1";
    port = 5432;
    extensions = extensions: [
      extensions.pgvector
    ];
    initialDatabases = [
      { name = "gloss"; }
    ];
    # Use trust auth for local development (no password needed)
    settings = {
      log_connections = true;
      log_statement = "all";
    };
    initialScript = ''
      CREATE USER postgres WITH SUPERUSER PASSWORD 'postgres';
      GRANT ALL PRIVILEGES ON DATABASE gloss TO postgres;
      -- Enable pgvector extension
      \c gloss
      CREATE EXTENSION IF NOT EXISTS vector;
    '';
  };

  # Scripts for common tasks
  scripts = {
    dev.exec = ''
      echo "Starting Gloss (web :3001 + server :3000 + extension HMR :5555)..."
      echo "Extension output: apps/extension/.output/chrome-mv3-dev"
      echo ""
      bun run dev
    '';

    dev-chrome.exec = ''
      echo "Starting Gloss for Chrome..."
      echo "Extension auto-loads with browser"
      echo ""
      bun run dev
    '';

    dev-firefox.exec = ''
      echo "Starting Gloss for Firefox..."
      echo "Extension auto-loads with browser"
      echo ""
      bun run dev:firefox
    '';

    build-ext.exec = ''
      echo "Building browser extension..."
      bun run build:ext
      echo "Output: apps/extension/.output/chrome-mv3"
    '';

    zip-ext.exec = ''
      echo "Packaging browser extension for Chrome Web Store..."
      bun run zip:ext
    '';

    db-reset.exec = ''
      echo "Resetting database..."
      dropdb --if-exists gloss
      createdb gloss
      echo "Database reset. Running setup + schema push..."
      bun run db:init
    '';

    setup.exec = ''
      echo "Installing dependencies..."
      bun install
      echo ""
      echo "Setting up database (extensions + schema)..."
      echo "(Make sure PostgreSQL is running: 'devenv up' in another terminal)"
      echo ""
      bun run db:init
      echo ""
      echo "Setup complete! Run 'dev' to start all services."
    '';

    pg.exec = ''
      echo "Starting PostgreSQL..."
      devenv up postgres
    '';
  };

  # Shell hook runs on entering the devenv shell
  enterShell = ''
    echo ""
    echo "Gloss Development Environment"
    echo "=============================="
    echo ""
    echo "First time? Run in separate terminals:"
    echo "  1. devenv up    # Starts PostgreSQL"
    echo "  2. setup        # Install deps + setup DB + push schema"
    echo "  3. dev-chrome   # Start all services + open Chrome"
    echo ""
    echo "Commands:"
    echo "  dev-chrome  - All services + open Chrome"
    echo "  dev-firefox - All services + open Firefox"
    echo "  dev         - All services (no browser)"
    echo "  setup       - Install deps + setup DB + push schema"
    echo "  build-ext   - Build extension for production"
    echo "  db-reset    - Drop and recreate database"
    echo ""
  '';

  # Process management (optional - for running all services together)
  processes = {
    # Uncomment to auto-start servers when running `devenv up`
    # web.exec = "bun run dev:web";
    # server.exec = "bun run dev:server";
  };
}
