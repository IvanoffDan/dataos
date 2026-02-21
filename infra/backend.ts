import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { vpcConnector } from "./vpc";
import { repoUrl } from "./registry";
import { secrets } from "./secrets";
import { appServiceAccount } from "./iam";

const gcpConfig = new pulumi.Config("gcp");
const region = gcpConfig.require("region");
const config = new pulumi.Config("izakaya");
const domain = config.require("domain");

export const backendService = new gcp.cloudrunv2.Service("izakaya-backend", {
  name: "izakaya-backend",
  location: region,
  ingress: "INGRESS_TRAFFIC_ALL",
  template: {
    serviceAccount: appServiceAccount.email,
    vpcAccess: {
      connector: vpcConnector.id,
      egress: "PRIVATE_RANGES_ONLY",
    },
    containers: [
      {
        image: pulumi.interpolate`${repoUrl}/backend:latest`,
        ports: { containerPort: 8000 },
        envs: [
          {
            name: "DATABASE_URL",
            valueSource: {
              secretKeyRef: { secret: secrets["database-url"].secretId, version: "latest" },
            },
          },
          {
            name: "SECRET_KEY",
            valueSource: {
              secretKeyRef: { secret: secrets["secret-key"].secretId, version: "latest" },
            },
          },
          {
            name: "FIVETRAN_API_KEY",
            valueSource: {
              secretKeyRef: { secret: secrets["fivetran-api-key"].secretId, version: "latest" },
            },
          },
          {
            name: "FIVETRAN_API_SECRET",
            valueSource: {
              secretKeyRef: {
                secret: secrets["fivetran-api-secret"].secretId,
                version: "latest",
              },
            },
          },
          {
            name: "FIVETRAN_GROUP_ID",
            valueSource: {
              secretKeyRef: { secret: secrets["fivetran-group-id"].secretId, version: "latest" },
            },
          },
          {
            name: "ANTHROPIC_API_KEY",
            valueSource: {
              secretKeyRef: { secret: secrets["anthropic-api-key"].secretId, version: "latest" },
            },
          },
          { name: "FRONTEND_URL", value: `https://${domain}` },
          { name: "BQ_PROJECT_ID", value: gcp.config.project! },
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

// Allow unauthenticated access (frontend server-side calls, protected by session cookies)
new gcp.cloudrunv2.ServiceIamMember("backend-public", {
  name: backendService.name,
  location: region,
  role: "roles/run.invoker",
  member: "allUsers",
});

export const backendUrl = backendService.uri;

// Migration Cloud Run Job
export const migrationJob = new gcp.cloudrunv2.Job("izakaya-migrate", {
  name: "izakaya-migrate",
  location: region,
  template: {
    template: {
      serviceAccount: appServiceAccount.email,
      vpcAccess: {
        connector: vpcConnector.id,
        egress: "PRIVATE_RANGES_ONLY",
      },
      containers: [
        {
          image: pulumi.interpolate`${repoUrl}/backend:latest`,
          commands: ["uv", "run", "alembic", "upgrade", "head"],
          envs: [
            {
              name: "DATABASE_URL",
              valueSource: {
                secretKeyRef: { secret: secrets["database-url"].secretId, version: "latest" },
              },
            },
          ],
          resources: {
            limits: { memory: "512Mi", cpu: "1" },
          },
        },
      ],
      maxRetries: 1,
      timeout: "300s",
    },
  },
});
