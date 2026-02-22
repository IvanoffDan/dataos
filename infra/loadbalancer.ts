import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { backendService } from "./backend";
import { frontendService } from "./frontend";

const gcpConfig = new pulumi.Config("gcp");
const region = gcpConfig.require("region");
const config = new pulumi.Config("izakaya");
const domain = config.require("domain");

// --- Static IP ---

export const lbIp = new gcp.compute.GlobalAddress("izakaya-lb-ip", {
  name: "izakaya-lb-ip",
});

// --- Serverless NEGs ---

const frontendNeg = new gcp.compute.RegionNetworkEndpointGroup("izakaya-frontend-neg", {
  name: "izakaya-frontend-neg",
  region,
  networkEndpointType: "SERVERLESS",
  cloudRun: {
    service: frontendService.name,
  },
});

const backendNeg = new gcp.compute.RegionNetworkEndpointGroup("izakaya-backend-neg", {
  name: "izakaya-backend-neg",
  region,
  networkEndpointType: "SERVERLESS",
  cloudRun: {
    service: backendService.name,
  },
});

// --- Backend Services ---

const frontendBackendService = new gcp.compute.BackendService("izakaya-frontend-bs", {
  name: "izakaya-frontend-bs",
  protocol: "HTTP",
  backends: [{ group: frontendNeg.id }],
});

const backendBackendService = new gcp.compute.BackendService("izakaya-backend-bs", {
  name: "izakaya-backend-bs",
  protocol: "HTTP",
  backends: [{ group: backendNeg.id }],
});

// --- URL Map ---

const urlMap = new gcp.compute.URLMap("izakaya-url-map", {
  name: "izakaya-url-map",
  defaultService: frontendBackendService.id,
  hostRules: [
    {
      hosts: [domain],
      pathMatcher: "main",
    },
  ],
  pathMatchers: [
    {
      name: "main",
      defaultService: frontendBackendService.id,
      pathRules: [
        {
          paths: ["/api/*"],
          service: backendBackendService.id,
          routeAction: {
            urlRewrite: {
              pathPrefixRewrite: "/",
            },
          },
        },
      ],
    },
  ],
});

// --- Managed SSL Certificate ---

const sslCert = new gcp.compute.ManagedSslCertificate("izakaya-ssl", {
  name: "izakaya-ssl",
  managed: {
    domains: [domain],
  },
});

// --- HTTPS Target Proxy + Forwarding Rule ---

const httpsProxy = new gcp.compute.TargetHttpsProxy("izakaya-https-proxy", {
  name: "izakaya-https-proxy",
  urlMap: urlMap.id,
  sslCertificates: [sslCert.id],
});

new gcp.compute.GlobalForwardingRule("izakaya-https-rule", {
  name: "izakaya-https-rule",
  target: httpsProxy.id,
  portRange: "443",
  ipAddress: lbIp.address,
  loadBalancingScheme: "EXTERNAL",
});

// --- HTTP → HTTPS Redirect ---

const httpRedirectUrlMap = new gcp.compute.URLMap("izakaya-http-redirect", {
  name: "izakaya-http-redirect",
  defaultUrlRedirect: {
    httpsRedirect: true,
    stripQuery: false,
    redirectResponseCode: "MOVED_PERMANENTLY_DEFAULT",
  },
});

const httpProxy = new gcp.compute.TargetHttpProxy("izakaya-http-proxy", {
  name: "izakaya-http-proxy",
  urlMap: httpRedirectUrlMap.id,
});

new gcp.compute.GlobalForwardingRule("izakaya-http-rule", {
  name: "izakaya-http-rule",
  target: httpProxy.id,
  portRange: "80",
  ipAddress: lbIp.address,
  loadBalancingScheme: "EXTERNAL",
});
