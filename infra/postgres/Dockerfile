# PostgreSQL 18 with the four extensions the migration needs.
#
# No single published image ships both PostGIS and pgvector for PG18:
#   - postgis/postgis:18-3.6      PostGIS, but amd64 only (no arm64 manifest)
#   - imresamu/postgis:18-3.6-*   the multi-arch community rebuild of the above
#   - pgvector/pgvector:pg18-*    pgvector, no PostGIS
# So: start from the multi-arch PostGIS image (Apple Silicon and CI both work)
# and add pgvector from the PGDG apt repo the official postgres image configures.
FROM imresamu/postgis:18-3.6-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-18-pgvector \
  && rm -rf /var/lib/apt/lists/*
