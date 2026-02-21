import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { enabledApis } from "./apis";

const config = new pulumi.Config("izakaya");

// Secret names managed in Secret Manager
const secretNames = [
  "database-url",
  "secret-key",
  "fivetran-api-key",
  "fivetran-api-secret",
  "fivetran-group-id",
  "anthropic-api-key",
];

// Create Secret Manager secrets (depends on API being enabled)
export const secrets: Record<string, gcp.secretmanager.Secret> = {};
for (const name of secretNames) {
  secrets[name] = new gcp.secretmanager.Secret(
    `secret-${name}`,
    {
      secretId: `izakaya-${name}`,
      replication: {
        auto: {},
      },
    },
    { dependsOn: [enabledApis["secretmanager.googleapis.com"]] }
  );
}

// Helper to create secret versions from Pulumi config
// DATABASE_URL is constructed from Cloud SQL outputs, others come from config
function getSecretValue(name: string): pulumi.Output<string> | undefined {
  try {
    return config.requireSecret(name);
  } catch {
    return undefined;
  }
}

// Create versions for secrets that have values in config
for (const name of secretNames) {
  if (name === "database-url") continue; // Set separately after Cloud SQL is created
  const value = getSecretValue(name);
  if (value) {
    new gcp.secretmanager.SecretVersion(`secret-version-${name}`, {
      secret: secrets[name].id,
      secretData: value,
    });
  }
}

// Export for use in other modules
export const databaseUrlSecret = secrets["database-url"];

export function setDatabaseUrlVersion(url: pulumi.Output<string>) {
  new gcp.secretmanager.SecretVersion("secret-version-database-url", {
    secret: secrets["database-url"].id,
    secretData: url,
  });
}
