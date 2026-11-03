/**
 * Number of committed migrations. Readiness uses it to detect a database that is behind the
 * build; the matching test fails when a migration is added without updating this value.
 */
export const EXPECTED_MIGRATION_COUNT = 5;
