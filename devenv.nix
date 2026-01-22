{ pkgs, lib, config, ... }:

{
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
    CORS_ORIGIN = "http://localhost:3001";
    NODE_ENV = "development";
    PORT = "3000";

    # Web client
    VITE_SERVER_URL = "http://localhost:3000";
  };

  # PostgreSQL service
  services.postgres = {
    enable = true;
    listen_addresses = "127.0.0.1";
    port = 5432;
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
    '';
  };

  # Scripts for common tasks
  scripts = {
    dev.exec = ''
      echo "Starting Gloss development servers..."
      bun run dev
    '';

    db-reset.exec = ''
      echo "Resetting database..."
      dropdb --if-exists gloss
      createdb gloss
      echo "Database reset. Run 'bun run db:push' to apply schema."
    '';

    setup.exec = ''
      echo "Installing dependencies..."
      bun install
      echo ""
      echo "Pushing database schema..."
      bun run db:push
      echo ""
      echo "Setup complete! Run 'dev' to start the development servers."
    '';
  };

  # Shell hook runs on entering the devenv shell
  enterShell = ''
    echo ""
    echo "Gloss Development Environment"
    echo "=============================="
    echo ""
    echo "PostgreSQL: localhost:5432/gloss (user: postgres, pass: postgres)"
    echo "Version control: jj (jujutsu)"
    echo ""
    echo "Available commands:"
    echo "  dev        - Start all development servers"
    echo "  setup      - Install deps + push DB schema"
    echo "  db-reset   - Drop and recreate the database"
    echo ""
    echo "Manual commands:"
    echo "  bun run dev:web     - Web app only (port 3001)"
    echo "  bun run dev:server  - API server only (port 3000)"
    echo "  bun run db:studio   - Open Drizzle Studio"
    echo ""
  '';

  # Process management (optional - for running all services together)
  processes = {
    # Uncomment to auto-start servers when running `devenv up`
    # web.exec = "bun run dev:web";
    # server.exec = "bun run dev:server";
  };
}
