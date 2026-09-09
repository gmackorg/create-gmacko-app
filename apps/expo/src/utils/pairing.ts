/**
 * Parse a scanned pairing QR: `{ url, code }` where `code` is a pre-approved
 * RFC 8628 device code minted by the web app's "Pair Mobile Device" panel.
 * The QR never contains a credential — the code is exchanged for a session
 * token at /device/token, and that exchange succeeds exactly once.
 */
import { Option, Schema } from "effect";

const PairingPayload = Schema.Struct({
  url: Schema.String,
  code: Schema.String,
});
export type PairingPayload = typeof PairingPayload.Type;

const decodePairingPayload = Schema.decodeUnknownOption(PairingPayload);

export function parsePairingQR(data: string): PairingPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  const payload = decodePairingPayload(parsed);
  return Option.isSome(payload)
    ? { url: payload.value.url, code: payload.value.code }
    : null;
}
