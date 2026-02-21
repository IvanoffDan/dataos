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
