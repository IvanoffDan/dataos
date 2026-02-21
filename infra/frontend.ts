import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { repoUrl } from "./registry";
import { appServiceAccount } from "./iam";
import { backendUrl } from "./backend";

const gcpConfig = new pulumi.Config("gcp");
const region = gcpConfig.require("region");
const config = new pulumi.Config("izakaya");
const domain = config.require("domain");

export const frontendService = new gcp.cloudrunv2.Service("izakaya-frontend", {
  name: "izakaya-frontend",
  location: region,
  ingress: "INGRESS_TRAFFIC_ALL",
  template: {
    serviceAccount: appServiceAccount.email,
    containers: [
      {
        image: pulumi.interpolate`${repoUrl}/frontend:latest`,
        ports: { containerPort: 3000 },
        envs: [
          {
            name: "BACKEND_INTERNAL_URL",
            value: backendUrl,
          },
        ],
        resources: {
          limits: { memory: "512Mi", cpu: "1" },
        },
      },
    ],
    scaling: {
      minInstanceCount: 0,
      maxInstanceCount: 2,
    },
  },
});

// Allow unauthenticated access (public-facing)
new gcp.cloudrunv2.ServiceIamMember("frontend-public", {
  name: frontendService.name,
  location: region,
  role: "roles/run.invoker",
  member: "allUsers",
});

// Custom domain mapping
export const domainMapping = new gcp.cloudrun.DomainMapping("izakaya-domain", {
  name: domain,
  location: region,
  metadata: {
    namespace: gcp.config.project!,
  },
  spec: {
    routeName: frontendService.name,
  },
});

export const frontendUrl = frontendService.uri;
