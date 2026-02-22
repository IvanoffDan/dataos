import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import { enabledApis } from "./apis";
import { network, privateConnection } from "./vpc";

const gcpConfig = new pulumi.Config("gcp");
const region = gcpConfig.require("region");
const sqlApi = enabledApis["sqladmin.googleapis.com"];

const dbPassword = new random.RandomPassword("db-password", {
  length: 32,
  special: false,
});

export const instance = new gcp.sql.DatabaseInstance(
  "izakaya-db",
  {
    databaseVersion: "POSTGRES_15",
    region,
    settings: {
      tier: "db-f1-micro",
      ipConfiguration: {
        ipv4Enabled: true, // Public IP for Dagster Cloud
        privateNetwork: network.selfLink,
        sslMode: "ENCRYPTED_ONLY",
        authorizedNetworks: [
          // Dagster Cloud Serverless IPs (US region)
          // https://docs.dagster.io/deployment/dagster-plus/serverless/dagster-ips
          { name: "dagster-1", value: "34.216.9.66/32" },
          { name: "dagster-2", value: "35.162.181.243/32" },
          { name: "dagster-3", value: "35.83.14.215/32" },
          { name: "dagster-4", value: "44.230.239.144/32" },
          { name: "dagster-5", value: "44.240.64.133/32" },
          { name: "dagster-6", value: "52.34.41.163/32" },
          { name: "dagster-7", value: "52.36.97.173/32" },
          { name: "dagster-8", value: "52.37.188.218/32" },
          { name: "dagster-9", value: "52.38.102.213/32" },
          { name: "dagster-10", value: "52.39.253.102/32" },
          { name: "dagster-11", value: "52.40.171.60/32" },
          { name: "dagster-12", value: "52.89.191.177/32" },
          { name: "dagster-13", value: "54.201.195.80/32" },
          { name: "dagster-14", value: "54.68.25.27/32" },
          { name: "dagster-15", value: "54.71.18.84/32" },
        ],
      },
    },
    deletionProtection: false,
  },
  { dependsOn: [privateConnection, sqlApi] }
);

export const database = new gcp.sql.Database("izakaya", {
  instance: instance.name,
  name: "izakaya",
});

export const user = new gcp.sql.User("izakaya", {
  instance: instance.name,
  name: "izakaya",
  password: dbPassword.result,
});

// Construct DATABASE_URL using private IP (for Cloud Run via VPC connector)
export const privateIp = instance.privateIpAddress;
export const publicIp = instance.publicIpAddress;

export const databaseUrl = pulumi.interpolate`postgresql://${user.name}:${dbPassword.result}@${privateIp}/izakaya`;

// Public DATABASE_URL for Dagster Cloud (uses public IP + sslmode)
export const publicDatabaseUrl = pulumi.interpolate`postgresql://${user.name}:${dbPassword.result}@${publicIp}/izakaya?sslmode=require`;
