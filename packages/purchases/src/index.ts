import type {
  CustomerInfo,
  PurchasesOfferings,
  PurchasesPackage,
} from "react-native-purchases";
import Purchases, { LOG_LEVEL } from "react-native-purchases";

import { integrations } from "@gmacko/config";

export interface RevenueCatConfig {
  apiKey: string;
  appUserId?: string;
  useAmazon?: boolean;
}

let isConfigured = false;

export async function initRevenueCat(config: RevenueCatConfig): Promise<void> {
  if (!integrations.revenuecat || isConfigured) {
    return;
  }

  Purchases.setLogLevel(LOG_LEVEL.DEBUG);

  if (config.useAmazon) {
    await Purchases.configure({
      apiKey: config.apiKey,
      appUserID: config.appUserId,
      useAmazon: true,
    });
  } else {
    await Purchases.configure({
      apiKey: config.apiKey,
      appUserID: config.appUserId,
    });
  }

  isConfigured = true;
}

export async function getOfferings(): Promise<PurchasesOfferings | null> {
  if (!integrations.revenuecat) {
    return null;
  }

  try {
    return await Purchases.getOfferings();
  } catch (error) {
    console.error("Failed to get offerings:", error);
    return null;
  }
}

export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<CustomerInfo | null> {
  if (!integrations.revenuecat) {
    return null;
  }

  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return customerInfo;
  } catch (error) {
    console.error("Purchase failed:", error);
    throw error;
  }
}

export async function restorePurchases(): Promise<CustomerInfo | null> {
  if (!integrations.revenuecat) {
    return null;
  }

  try {
    return await Purchases.restorePurchases();
  } catch (error) {
    console.error("Restore failed:", error);
    throw error;
  }
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!integrations.revenuecat) {
    return null;
  }

  try {
    return await Purchases.getCustomerInfo();
  } catch (error) {
    console.error("Failed to get customer info:", error);
    return null;
  }
}

export async function loginUser(
  appUserId: string,
): Promise<CustomerInfo | null> {
  if (!integrations.revenuecat) {
    return null;
  }

  try {
    const { customerInfo } = await Purchases.logIn(appUserId);
    return customerInfo;
  } catch (error) {
    console.error("Login failed:", error);
    throw error;
  }
}

export async function logoutUser(): Promise<CustomerInfo | null> {
  if (!integrations.revenuecat) {
    return null;
  }

  try {
    return await Purchases.logOut();
  } catch (error) {
    console.error("Logout failed:", error);
    throw error;
  }
}

export function hasActiveEntitlement(
  customerInfo: CustomerInfo,
  entitlementId: string,
): boolean {
  return customerInfo.entitlements.active[entitlementId] !== undefined;
}

export { Purchases };
export type { CustomerInfo, PurchasesOfferings, PurchasesPackage };
