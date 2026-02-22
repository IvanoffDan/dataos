import * as gcp from "@pulumi/gcp";
import { enabledApis } from "./apis";

const project = gcp.config.project!;
const iamApi = enabledApis["iam.googleapis.com"];

// Service account for Cloud Run services (backend + frontend)
export const appServiceAccount = new gcp.serviceaccount.Account(
  "izakaya-app",
  {
    accountId: "izakaya-app",
    displayName: "Izakaya Cloud Run",
  },
  { dependsOn: [iamApi] }
);

// BigQuery access
new gcp.projects.IAMMember("app-bq-data-editor", {
  project,
  role: "roles/bigquery.dataEditor",
  member: appServiceAccount.email.apply((e) => `serviceAccount:${e}`),
});

new gcp.projects.IAMMember("app-bq-job-user", {
  project,
  role: "roles/bigquery.jobUser",
  member: appServiceAccount.email.apply((e) => `serviceAccount:${e}`),
});

// Cloud SQL client
new gcp.projects.IAMMember("app-cloudsql-client", {
  project,
  role: "roles/cloudsql.client",
  member: appServiceAccount.email.apply((e) => `serviceAccount:${e}`),
});

// Secret Manager access
new gcp.projects.IAMMember("app-secret-accessor", {
  project,
  role: "roles/secretmanager.secretAccessor",
  member: appServiceAccount.email.apply((e) => `serviceAccount:${e}`),
});

// Service account for GitHub Actions CI/CD
export const githubServiceAccount = new gcp.serviceaccount.Account(
  "izakaya-github",
  {
    accountId: "izakaya-github",
    displayName: "Izakaya GitHub Actions",
  },
  { dependsOn: [iamApi] }
);

// Artifact Registry writer
new gcp.projects.IAMMember("github-ar-writer", {
  project,
  role: "roles/artifactregistry.writer",
  member: githubServiceAccount.email.apply((e) => `serviceAccount:${e}`),
});

// Cloud Run admin (deploy services + execute jobs)
new gcp.projects.IAMMember("github-run-admin", {
  project,
  role: "roles/run.admin",
  member: githubServiceAccount.email.apply((e) => `serviceAccount:${e}`),
});

// Cloud SQL admin (modify instances — e.g. tier changes)
new gcp.projects.IAMMember("github-cloudsql-admin", {
  project,
  role: "roles/cloudsql.admin",
  member: githubServiceAccount.email.apply((e) => `serviceAccount:${e}`),
});

// Act as the app service account (needed for Cloud Run deploy)
new gcp.serviceaccount.IAMMember("github-acts-as-app", {
  serviceAccountId: appServiceAccount.name,
  role: "roles/iam.serviceAccountUser",
  member: githubServiceAccount.email.apply((e) => `serviceAccount:${e}`),
});

// Service account for Dagster Cloud
export const dagsterServiceAccount = new gcp.serviceaccount.Account(
  "izakaya-dagster",
  {
    accountId: "izakaya-dagster",
    displayName: "Izakaya Dagster Cloud",
  },
  { dependsOn: [iamApi] }
);

new gcp.projects.IAMMember("dagster-bq-data-editor", {
  project,
  role: "roles/bigquery.dataEditor",
  member: dagsterServiceAccount.email.apply((e) => `serviceAccount:${e}`),
});

new gcp.projects.IAMMember("dagster-bq-job-user", {
  project,
  role: "roles/bigquery.jobUser",
  member: dagsterServiceAccount.email.apply((e) => `serviceAccount:${e}`),
});

new gcp.projects.IAMMember("dagster-cloudsql-client", {
  project,
  role: "roles/cloudsql.client",
  member: dagsterServiceAccount.email.apply((e) => `serviceAccount:${e}`),
});
