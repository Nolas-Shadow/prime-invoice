#!/bin/bash
set -euo pipefail
# Participant and synchronizer must not share one database.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  CREATE DATABASE canton_participant;
  CREATE DATABASE canton_synchronizer;
EOSQL
