export function testDatabaseUrl() {
  const value = process.env.TEST_DATABASE_URL;
  if (!value)
    throw new Error(
      "TEST_DATABASE_URL is required. Use a disposable local database ending in _test.",
    );
  const parsed = new URL(value);
  if (
    !/^postgres(ql)?:$/.test(parsed.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    !/^\/[a-z0-9_]+_test$/.test(parsed.pathname)
  )
    throw new Error(
      "Tests require a dedicated loopback PostgreSQL database ending in _test.",
    );
  if (
    process.env.DATABASE_URL &&
    new URL(process.env.DATABASE_URL).pathname === parsed.pathname
  )
    throw new Error("Application and test databases must differ.");
  return value;
}
