import { platformPrimitives } from "@gmacko/config";
import { PlatformPrimitives } from "@gmacko/domain/settings";

/** A constant from `@gmacko/config`; the same object `admin.launchControls` embeds. */
export const primitives = new PlatformPrimitives({
  featureFlags: {
    enabled: platformPrimitives.featureFlags.enabled,
    provider: platformPrimitives.featureFlags.provider,
  },
  jobs: {
    enabled: platformPrimitives.jobs.enabled,
    provider: platformPrimitives.jobs.provider,
  },
  rateLimits: {
    enabled: platformPrimitives.rateLimits.enabled,
    scopes: [...platformPrimitives.rateLimits.scopes],
  },
  botProtection: {
    enabled: platformPrimitives.botProtection.enabled,
    provider: platformPrimitives.botProtection.provider,
  },
  compliance: {
    enabled: platformPrimitives.compliance.enabled,
    dataExport: platformPrimitives.compliance.dataExport,
    dataDeletion: platformPrimitives.compliance.dataDeletion,
  },
  emailDelivery: {
    enabled: platformPrimitives.emailDelivery.enabled,
    provider: platformPrimitives.emailDelivery.provider,
    requiredEnv: [...platformPrimitives.emailDelivery.requiredEnv],
  },
});
