export function readSecret(name: string, fallback: string): string {
  const value = process.env[name] ?? fallback;
  if (process.env.NODE_ENV === "production" && value === fallback) {
    throw new Error(`${name} must be set in production`);
  }
  return value;
}
