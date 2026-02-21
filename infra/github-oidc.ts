import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { githubServiceAccount } from "./iam";

const config = new pulumi.Config("izakaya");
const githubRepo = config.require("github-repo");
const project = gcp.config.project!;

export const workloadIdentityPool = new gcp.iam.WorkloadIdentityPool("github-pool", {
  workloadIdentityPoolId: "github-pool",
  displayName: "GitHub Actions",
});

export const workloadIdentityProvider = new gcp.iam.WorkloadIdentityPoolProvider(
  "github-provider",
  {
    workloadIdentityPoolId: workloadIdentityPool.workloadIdentityPoolId,
    workloadIdentityPoolProviderId: "github-provider",
    displayName: "GitHub Actions OIDC",
    attributeMapping: {
      "google.subject": "assertion.sub",
      "attribute.actor": "assertion.actor",
      "attribute.repository": "assertion.repository",
    },
    attributeCondition: `assertion.repository == "${githubRepo}"`,
    oidc: {
      issuerUri: "https://token.actions.githubusercontent.com",
    },
  }
);

// Allow GitHub Actions to impersonate the GitHub service account
new gcp.serviceaccount.IAMMember("github-oidc-binding", {
  serviceAccountId: githubServiceAccount.name,
  role: "roles/iam.workloadIdentityUser",
  member: pulumi.interpolate`principalSet://iam.googleapis.com/${workloadIdentityPool.name}/attribute.repository/${githubRepo}`,
});

export const workloadIdentityProviderName = workloadIdentityProvider.name;

// Export the full provider resource name for GitHub Actions
export const workloadIdentityProviderResourceName = pulumi.interpolate`projects/${project}/locations/global/workloadIdentityPools/${workloadIdentityPool.workloadIdentityPoolId}/providers/${workloadIdentityProvider.workloadIdentityPoolProviderId}`;
