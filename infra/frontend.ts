import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { repoUrl } from "./registry";
import { appServiceAccount } from "./iam";
const gcpConfig = new pulumi.Config("gcp");
const region = gcpConfig.require("region");

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

export const frontendUrl = frontendService.uri;
