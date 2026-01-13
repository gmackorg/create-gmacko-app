import type { ConfigContext, ExpoConfig } from "expo/config";

const APP_ENV = process.env.APP_ENV ?? "development";
const API_URL = process.env.API_URL ?? "http://localhost:3000";

const SENTRY_DSN = process.env.SENTRY_DSN;
const POSTHOG_KEY = process.env.POSTHOG_KEY;
const POSTHOG_HOST = process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";

const getAppName = (): string => {
  switch (APP_ENV) {
    case "production":
      return "Gmacko";
    case "staging":
      return "Gmacko (Beta)";
    default:
      return "Gmacko (Dev)";
  }
};

const getBundleId = (): string => {
  const base = "com.gmacko.app";
  switch (APP_ENV) {
    case "production":
      return base;
    case "staging":
      return `${base}.beta`;
    default:
      return `${base}.dev`;
  }
};

const getSentryConfig = () => {
  if (!SENTRY_DSN) return null;

  return [
    "@sentry/react-native/expo",
    {
      organization: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
    },
  ];
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const sentryPlugin = getSentryConfig();
  const plugins: ExpoConfig["plugins"] = [
    "expo-router",
    "expo-secure-store",
    "expo-web-browser",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#E4E4E7",
        image: "./assets/icon-light.png",
        dark: {
          backgroundColor: "#18181B",
          image: "./assets/icon-dark.png",
        },
      },
    ],
  ];

  if (sentryPlugin) {
    plugins.push(sentryPlugin as [string, Record<string, unknown>]);
  }

  return {
    ...config,
    name: getAppName(),
    slug: "gmacko",
    scheme: "gmacko",
    version: "0.1.0",
    orientation: "portrait",
    icon: "./assets/icon-light.png",
    userInterfaceStyle: "automatic",
    updates: {
      fallbackToCacheTimeout: 0,
      url: "https://u.expo.dev/your-project-id",
    },
    runtimeVersion: {
      policy: "appVersion",
    },
    newArchEnabled: true,
    assetBundlePatterns: ["**/*"],
    ios: {
      bundleIdentifier: getBundleId(),
      supportsTablet: true,
      icon: {
        light: "./assets/icon-light.png",
        dark: "./assets/icon-dark.png",
      },
      infoPlist: {
        CFBundleDisplayName: getAppName(),
      },
    },
    android: {
      package: getBundleId(),
      adaptiveIcon: {
        foregroundImage: "./assets/icon-light.png",
        backgroundColor: "#1F104A",
      },
      edgeToEdgeEnabled: true,
    },
    extra: {
      APP_ENV,
      API_URL,
      SENTRY_DSN,
      POSTHOG_KEY,
      POSTHOG_HOST,
      eas: {
        projectId: process.env.EAS_PROJECT_ID,
      },
    },
    owner: process.env.EXPO_OWNER,
    experiments: {
      tsconfigPaths: true,
      typedRoutes: true,
      reactCanary: true,
      reactCompiler: true,
    },
    plugins,
  };
};
