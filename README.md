# Cellar Assistant

**Uncork the potential of your collection with Cellar Assistant**

## Features

- TODO

## Technology Stack

- **Frontend:** Next.js
- **Backend:** Nhost (serverless backend platform with GraphQL API, authentication, and storage)

## Getting Started (local dev)

1. **Prerequisites:**
   - Node and Docker
2. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/cellar-assistant
   ```
3. **Install dependencies:**
   ```bash
   cd cellar-assistant
   nvm use
   npm ci
   ```
4. **Create a Nhost project and set up environment variables:**
   - Follow the documentation to install the [Nhost cli](https://docs.nhost.io/development/cli/getting-started)
   - Create a `.env.local` file in the project root and add the following variables:
     ```
      NEXT_PUBLIC_NHOST_REGION
      NEXT_PUBLIC_NHOST_SUBDOMAIN=local
     ```
   - Create a `.secrets` file in the project root and add the following variables:
     ```
      # OAuth Configuration
      DISCORD_OAUTH_CLIENT_ID = 'FIXME'
      DISCORD_OAUTH_CLIENT_SECRET = 'FIXME'
      FACEBOOK_OAUTH_CLIENT_ID = 'FIXME'
      FACEBOOK_OAUTH_CLIENT_SECRET = 'FIXME'
      GOOGLE_OAUTH_CLIENT_ID = 'FIXME'
      GOOGLE_OAUTH_CLIENT_SECRET = 'FIXME'

      # Nhost Configuration
      HASURA_GRAPHQL_ADMIN_SECRET = 'nhost-admin-secret'
      HASURA_GRAPHQL_JWT_SECRET = '0f987876650b4a085e64594fae9219e7781b17506bec02489ad061fba8cb22db'
      NHOST_WEBHOOK_SECRET = 'nhost-webhook-secret'

      # AI Provider Configuration (choose one setup)
      
      # Option 1: Local Development with Ollama (Recommended)
      AI_PROVIDER = 'ollama'
      OLLAMA_ENDPOINT = 'http://localhost:11434'
      OLLAMA_MODEL = 'llama3.2-vision:11b'
      
      # Option 2: Google AI (Simple Cloud Setup)
      # AI_PROVIDER = 'google-ai'
      # GOOGLE_AI_API_KEY = 'your-google-ai-api-key'
      # GOOGLE_AI_MODEL = 'gemini-2.0-flash-exp'
      
      # Option 3: Vertex AI (Enterprise/Production)
      # AI_PROVIDER = 'vertex-ai'
      # GOOGLE_GCP_PROJECT_ID = 'your-gcp-project-id'
      # GOOGLE_GCP_VERTEX_AI_LOCATION = 'us-central1'
      # VERTEX_AI_MODEL = 'gemini-2.0-flash-001'
      # CREDENTIALS_GCP_ID = 'your-credentials-db-id'

      # Legacy/Other Configuration
      GRAFANA_ADMIN_PASSWORD = 'FIXME'
      PLACEHOLDER_API_URL = 'FIXME'
     ```
5. **Set up AI Provider (Ollama for local development):**
   ```bash
   # Install Ollama (visit https://ollama.ai for installation instructions)
   # Pull the vision model for item analysis
   ollama pull llama3.2-vision:11b
   
   # Start Ollama (usually starts automatically after installation)
   ollama serve
   ```
6. **Start the local nhost environment:**
   ```bash
   nhost up --apply-seeds
   ```
7. **Start the development server:**
   ```bash
   npm run dev
   ```
8. **Urls**
   - Cellar Assistant: http://localhost:3000
   - Postgres: postgres://postgres:postgres@localhost:5432/local
   - Hasura: https://local.hasura.nhost.run
   - GraphQL: https://local.graphql.nhost.run
   - Auth: https://local.auth.nhost.run
   - Storage: https://local.storage.nhost.run
   - Functions: https://local.functions.nhost.run
   - Dashboard: https://local.dashboard.nhost.run
   - Mailhog: https://local.mailhog.nhost.run
9. **Logins**
   - test@test.com:123456789
   - test2@test.com:123456789

## AI Provider Options

Cellar Assistant uses AI for analyzing wine, beer, spirit, and coffee labels from images. You can choose from three AI providers:

### 🏠 Ollama (Recommended for Development)
- **Pros**: Free, runs locally, no API keys needed, complete privacy
- **Cons**: Requires local installation and model download (~7GB)
- **Best for**: Local development, privacy-sensitive use cases
- **Setup**: Install from [ollama.ai](https://ollama.ai), then `ollama pull llama3.2-vision:11b`

### ☁️ Google AI (Simple Cloud Setup)
- **Pros**: Easy setup with just an API key, fast response times
- **Cons**: Costs money per request, data sent to Google
- **Best for**: Simple cloud deployments, prototyping
- **Setup**: Get API key from [Google AI Studio](https://aistudio.google.com)

### 🏢 Vertex AI (Enterprise/Production)
- **Pros**: Enterprise-grade, integrates with existing GCP infrastructure
- **Cons**: More complex setup, requires GCP project
- **Best for**: Production deployments, enterprise environments
- **Setup**: Requires GCP project with Vertex AI enabled

## Contributing

We welcome contributions from the community! Please feel free to open issues or pull requests.
