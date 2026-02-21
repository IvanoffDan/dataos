import * as gcp from "@pulumi/gcp";

const apiList = [
  "run.googleapis.com",
  "sqladmin.googleapis.com",
  "artifactregistry.googleapis.com",
  "secretmanager.googleapis.com",
  "vpcaccess.googleapis.com",
  "servicenetworking.googleapis.com",
  "compute.googleapis.com",
  "iam.googleapis.com",
  "cloudresourcemanager.googleapis.com",
  "iamcredentials.googleapis.com",
];

export const enabledApis: Record<string, gcp.projects.Service> = {};
for (const api of apiList) {
  enabledApis[api] = new gcp.projects.Service(`api-${api}`, {
    service: api,
    disableOnDestroy: false,
  });
}
