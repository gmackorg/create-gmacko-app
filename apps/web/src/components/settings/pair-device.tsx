import { PAIRING_CLIENT_ID } from "@gmacko/config";
import { Button } from "@gmacko/ui/button";
import { SettingsCard } from "@gmacko/ui/settings-card";
import { useCallback, useEffect, useState } from "react";
import QRCode from "react-qr-code";

import { authClient } from "~/auth/client";

/**
 * The QR carries a pre-approved RFC 8628 device code — a short-lived,
 * single-use credential that redeems (at /api/auth/device/token) for a
 * session as the signed-in user. Treat it like a password on screen: anyone
 * who photographs it can pair within its lifetime, so it is denied as soon
 * as the user is done displaying it.
 */
interface Pairing {
  readonly url: string;
  readonly code: string;
  readonly userCode: string;
}

export function PairDeviceSection() {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Revoke an outstanding pre-approved code so a photographed QR cannot be
  // redeemed after the user stops showing it.
  const denyPairing = useCallback((userCode: string) => {
    void authClient.device.deny({ userCode });
  }, []);

  const dismiss = useCallback(() => {
    if (pairing) denyPairing(pairing.userCode);
    setPairing(null);
    setExpiresIn(null);
  }, [pairing, denyPairing]);

  // Also revoke if the user navigates away without clicking Done.
  useEffect(() => {
    if (!pairing) return;
    return () => denyPairing(pairing.userCode);
  }, [pairing, denyPairing]);

  const generatePairingCode = async () => {
    setGenerating(true);
    setError(null);
    try {
      const { data: code, error: codeError } = await authClient.device.code({
        client_id: PAIRING_CLIENT_ID,
      });
      if (codeError || !code) {
        throw new Error(
          codeError?.error_description ?? "Could not start pairing",
        );
      }

      // Pre-approve the flow as the signed-in user so the phone can redeem
      // the device code without a separate approval step.
      const { error: approveError } = await authClient.device.approve({
        userCode: code.user_code,
      });
      if (approveError) {
        throw new Error(
          approveError.error_description ?? "Could not approve pairing",
        );
      }

      setPairing({
        url: window.location.origin,
        code: code.device_code,
        userCode: code.user_code,
      });
      setExpiresIn(code.expires_in);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create a pairing code",
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <SettingsCard
      title="Pair Mobile Device"
      description={
        <>
          Open the mobile app, choose <strong>Scan QR Code</strong>, and point
          it at the code below. The device signs in as you — no password needed.
        </>
      }
      data-testid="pair-device"
    >
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      {!pairing ? (
        <Button
          onClick={() => void generatePairingCode()}
          disabled={generating}
        >
          {generating ? "Generating…" : "Generate pairing QR"}
        </Button>
      ) : (
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Scan this now and only on your own device. It is a single-use
            sign-in code
            {expiresIn !== null &&
              ` that works for the next ${Math.max(1, Math.round(expiresIn / 60))} minutes`}
            — anyone who captures it can pair until you click Done. Don&apos;t
            screenshot or share it.
          </p>
          {/* White pad — QR scanners need high contrast regardless of theme. */}
          <div className="inline-block rounded-lg bg-white p-4">
            <QRCode value={JSON.stringify(pairing)} size={196} />
          </div>
          <div>
            <Button variant="ghost" size="sm" onClick={dismiss}>
              Done
            </Button>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}
