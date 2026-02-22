// Import modules (APIs are enabled in apis.ts, other modules depend on them)
import { instance as dbInstance, databaseUrl, publicDatabaseUrl } from "./database";
import { repoUrl } from "./registry";
import { setDatabaseUrlVersion } from "./secrets";
import { appServiceAccount, githubServiceAccount, dagsterServiceAccount } from "./iam";
import { backendUrl } from "./backend";
import { frontendUrl } from "./frontend";
import { workloadIdentityProviderResourceName } from "./github-oidc";
import { lbIp } from "./loadbalancer";

// Wire up the DATABASE_URL secret with the actual Cloud SQL connection string
setDatabaseUrlVersion(databaseUrl);

// Stack outputs
export const outputs = {
  backendUrl,
  frontendUrl,
  repoUrl,
  dbPublicIp: dbInstance.publicIpAddress,
  dbPrivateIp: dbInstance.privateIpAddress,
  appServiceAccountEmail: appServiceAccount.email,
  githubServiceAccountEmail: githubServiceAccount.email,
  dagsterServiceAccountEmail: dagsterServiceAccount.email,
  workloadIdentityProvider: workloadIdentityProviderResourceName,
  publicDatabaseUrl,
  lbIp: lbIp.address,
};
