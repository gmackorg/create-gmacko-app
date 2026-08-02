// Validate env BEFORE the router loads (ESM evaluates this side-effect import
// fully first) so a misconfigured preview/production build fails fast at boot
// instead of silently running against scaffold placeholders.
import "./src/config/validate-boot";
import "expo-router/entry";
