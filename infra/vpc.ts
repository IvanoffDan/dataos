import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { enabledApis } from "./apis";

const gcpConfig = new pulumi.Config("gcp");
const region = gcpConfig.require("region");

const computeApi = enabledApis["compute.googleapis.com"];
const vpcAccessApi = enabledApis["vpcaccess.googleapis.com"];
const serviceNetworkingApi = enabledApis["servicenetworking.googleapis.com"];

export const network = new gcp.compute.Network(
  "izakaya-vpc",
  { autoCreateSubnetworks: false },
  { dependsOn: [computeApi] }
);

export const subnet = new gcp.compute.Subnetwork("izakaya-subnet", {
  network: network.id,
  ipCidrRange: "10.0.0.0/24",
  region,
});

// Private IP range for Cloud SQL
const privateIpRange = new gcp.compute.GlobalAddress("izakaya-private-ip", {
  purpose: "VPC_PEERING",
  addressType: "INTERNAL",
  prefixLength: 16,
  network: network.id,
});

export const privateConnection = new gcp.servicenetworking.Connection(
  "izakaya-private-connection",
  {
    network: network.id,
    service: "servicenetworking.googleapis.com",
    reservedPeeringRanges: [privateIpRange.name],
  },
  { dependsOn: [serviceNetworkingApi] }
);

export const vpcConnector = new gcp.vpcaccess.Connector(
  "izakaya-vpc-conn",
  {
    region,
    network: network.id,
    ipCidrRange: "10.8.0.0/28",
    minInstances: 2,
    maxInstances: 3,
    machineType: "e2-micro",
  },
  { dependsOn: [vpcAccessApi] }
);
