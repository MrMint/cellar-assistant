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
      CREDENTIALS_GCP_ID = 'FIXME'
      DISCORD_OAUTH_CLIENT_ID = 'FIXME'
      DISCORD_OAUTH_CLIENT_SECRET = 'FIXME'
      FACEBOOK_OAUTH_CLIENT_ID = 'FIXME'
      FACEBOOK_OAUTH_CLIENT_SECRET = 'FIXME'
      GOOGLE_GCP_PROJECT_ID = 'FIXME'
      GOOGLE_OAUTH_CLIENT_ID = 'FIXME'
      GOOGLE_OAUTH_CLIENT_SECRET = 'FIXME'
      GRAFANA_ADMIN_PASSWORD = 'FIXME'
      HASURA_GRAPHQL_ADMIN_SECRET = 'nhost-admin-secret'
      HASURA_GRAPHQL_JWT_SECRET = '0f987876650b4a085e64594fae9219e7781b17506bec02489ad061fba8cb22db'
      NHOST_WEBHOOK_SECRET = 'nhost-webhook-secret'
      PLACEHOLDER_API_URL = 'FIXME'
     ```
5. **Start the local nhost environment:**
   ```bash
   nhost up --apply-seeds
   ```
6. **Start the development server:**
   ```bash
   npm run dev
   ```
7. **Urls**
   - Cellar Assistant: http://localhost:3000
   - Postgres: postgres://postgres:postgres@localhost:5432/local
   - Hasura: https://local.hasura.nhost.run
   - GraphQL: https://local.graphql.nhost.run
   - Auth: https://local.auth.nhost.run
   - Storage: https://local.storage.nhost.run
   - Functions: https://local.functions.nhost.run
   - Dashboard: https://local.dashboard.nhost.run
   - Mailhog: https://local.mailhog.nhost.run
8. **Logins**
   - test@test.com:123456789
   - test2@test.com:123456789

## Contributing

We welcome contributions from the community! Please feel free to open issues or pull requests.
