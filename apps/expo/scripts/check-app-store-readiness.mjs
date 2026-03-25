import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const appDir = path.resolve(import.meta.dirname, "..");

const checks = [
  {
    file: "app.config.ts",
    placeholder: "change-me.example.com",
    message: "Replace the placeholder associated domain.",
  },
  {
    file: "app.config.ts",
    placeholder: "your-project-id",
    message: "Replace the placeholder Expo project id.",
  },
  {
    file: "fastlane/metadata/en-US/name.txt",
    placeholder: "Your App Name",
    message: "Replace the placeholder App Store name.",
  },
  {
    file: "fastlane/metadata/en-US/privacy_url.txt",
    placeholder: "https://yourapp.com/privacy",
    message: "Replace the placeholder privacy policy URL.",
  },
  {
    file: "fastlane/metadata/en-US/support_url.txt",
    placeholder: "https://yourapp.com/support",
    message: "Replace the placeholder support URL.",
  },
];

const failures = [];

for (const check of checks) {
  const filePath = path.join(appDir, check.file);
  const content = fs.readFileSync(filePath, "utf8");

  if (content.includes(check.placeholder)) {
    failures.push(`${check.file}: ${check.message}`);
  }
}

if (failures.length > 0) {
  console.error("App Store readiness check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("App Store readiness check passed.");
