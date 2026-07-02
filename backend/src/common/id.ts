import { randomBytes } from "node:crypto";

export function randomToken(prefix: string, bytes = 18): string {
  return `${prefix}_${randomBytes(bytes).toString("base64url")}`;
}
