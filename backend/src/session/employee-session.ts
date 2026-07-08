export interface EmployeeSession {
  accountId: string;
  identityType?: "personal" | "wecom_member";
  tenantId: string;
  tenantName?: string;
  memberIdentityId: string;
  displayName?: string;
  openUserid: string;
  publicId?: string;
  status?: "active" | "disabled";
}
