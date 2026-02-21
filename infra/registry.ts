import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { enabledApis } from "./apis";

const gcpConfig = new pulumi.Config("gcp");
const region = gcpConfig.require("region");

export const repo = new gcp.artifactregistry.Repository(
  "izakaya",
  {
    repositoryId: "izakaya",
    format: "DOCKER",
    location: region,
  },
  { dependsOn: [enabledApis["artifactregistry.googleapis.com"]] }
);

export const repoUrl = pulumi.interpolate`${region}-docker.pkg.dev/${gcp.config.project}/${repo.repositoryId}`;
