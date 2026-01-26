# SearchNearbyPlaces Provider System

This function uses a modular provider pattern to allow easy switching between different place search implementations without changing business logic.

## Available Providers

### 1. BigQuery Provider (`bigquery`)
- **Description**: Queries real place data from Google's BigQuery Overture Maps dataset
- **Use Case**: Production environment with real place data
- **Requirements**: 
  - Google Cloud credentials (via `GOOGLE_APPLICATION_CREDENTIALS` or database)
  - `GOOGLE_GCP_PROJECT_ID` environment variable
  - `CREDENTIALS_GCP_ID` if using database-stored credentials

### 2. Mock Provider (`mock`)
- **Description**: Returns realistic mock place data for testing and development
- **Use Case**: Development, testing, and demonstrations
- **Requirements**: None (no external dependencies)

## Provider Selection

The system automatically selects the appropriate provider based on environment:

### Automatic Selection
- **Development/Local/Test**: Uses `mock` provider by default
- **Production**: Uses `bigquery` provider by default

### Manual Override
Set the `PLACE_SEARCH_PROVIDER` environment variable to force a specific provider:

```bash
# Force mock provider in any environment
PLACE_SEARCH_PROVIDER=mock

# Force BigQuery provider in any environment  
PLACE_SEARCH_PROVIDER=bigquery
```

## Environment Detection

The system checks these conditions for automatic selection:

```javascript
// Uses mock provider when any of these are true:
NODE_ENV === 'development'
NHOST_ENVIRONMENT === 'local'
NODE_ENV === 'test'

// Uses bigquery provider otherwise (production)
```

## Architecture

### Core Components

1. **`types.ts`**: Shared interfaces and types
2. **`provider-factory.ts`**: Factory pattern for creating providers
3. **`providers/`**: Individual provider implementations
4. **`index.ts`**: Main function using the provider system

### Adding New Providers

1. Create a new provider class implementing `PlaceSearchProvider`:

```typescript
export class MyCustomProvider implements PlaceSearchProvider {
  name = 'custom';
  
  constructor(private context: PlaceSearchContext) {}
  
  async searchPlaces(request: SearchNearbyPlacesRequest) {
    // Your implementation here
    return {
      places: [...],
      queryInfo: { ... }
    };
  }
}
```

2. Register the provider in `provider-factory.ts`:

```typescript
PlaceSearchProviderFactory.registerProvider('custom', MyCustomProvider);
```

3. Update the `ProviderType` union type:

```typescript
export type ProviderType = 'bigquery' | 'mock' | 'custom';
```

## Usage Examples

### Development Mode
```bash
# Automatically uses mock provider
NODE_ENV=development npm start
```

### Production Mode with Mock Data (for testing)
```bash
# Override to use mock data in production
PLACE_SEARCH_PROVIDER=mock npm start
```

### Force BigQuery in Development
```bash
# Override to use real data in development
PLACE_SEARCH_PROVIDER=bigquery npm start
```

## Benefits

✅ **Clean Separation**: Business logic is separated from data source implementation  
✅ **Easy Testing**: Switch to mock provider for reliable, fast tests  
✅ **Environment Flexibility**: Different providers for different environments  
✅ **Extensible**: Easy to add new data sources (Yelp, Foursquare, etc.)  
✅ **Consistent Interface**: All providers return the same data structure  
✅ **Zero Business Logic Changes**: Switch providers without changing main function code  

## Logging

Each provider logs its actions with a clear identifier:

```
[BigQuery Provider] Searching for places near (37.7749, -122.4194) within 5000m
[Mock Provider] Generating mock data for places near (37.7749, -122.4194) within 5000m
```

The main function also logs which provider is being used:

```
Using provider: bigquery
Using provider: mock
```