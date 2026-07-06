import { createHash } from "node:crypto";

export interface DefaultEmployeePublicIdInput {
  tenantId: string;
  memberIdentityId: string;
}

export function defaultEmployeePublicId(input: DefaultEmployeePublicIdInput): string {
  const digest = createHash("sha256")
    .update(`employee-card:${input.tenantId}:${input.memberIdentityId}`)
    .digest("base64url")
    .slice(0, 24);
  return `pub_${digest}`;
}

export function defaultEmployeeCardSlug(input: DefaultEmployeePublicIdInput): string {
  return `card-${defaultEmployeePublicId(input).slice("pub_".length, 24)}`;
}
