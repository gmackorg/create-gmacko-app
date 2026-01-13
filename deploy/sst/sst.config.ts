/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "gmacko",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    const secrets = {
      databaseUrl: new sst.Secret("DatabaseUrl"),
      authSecret: new sst.Secret("AuthSecret"),
      authDiscordId: new sst.Secret("AuthDiscordId"),
      authDiscordSecret: new sst.Secret("AuthDiscordSecret"),
    };

    const web = new sst.aws.Nextjs("Web", {
      path: "apps/nextjs",
      environment: {
        DATABASE_URL: secrets.databaseUrl.value,
        AUTH_SECRET: secrets.authSecret.value,
        AUTH_DISCORD_ID: secrets.authDiscordId.value,
        AUTH_DISCORD_SECRET: secrets.authDiscordSecret.value,
      },
      domain:
        $app.stage === "production"
          ? "app.yourdomain.com"
          : `${$app.stage}.app.yourdomain.com`,
    });

    return {
      webUrl: web.url,
    };
  },
});
