import type { Engine, CallContext } from "../../engine.js";
/** Structural contract implemented by the real app's opt-in projection seam. */
export interface AcknowledgedProductionCommand {
    teamId: string;
    sessionId: string;
    broadcastId: string | null;
    commandId: string;
    operatorId: string;
    sequence: number;
    type: "set_preview" | "cut" | "auto";
    payload: unknown;
    issuedAt: string;
    completedAt: string;
}
/** Project an existing acknowledgment. Never dispatches/retries OBS or grants app access.
 * Receipt keys make each stage restartable; the final typed link is the publication marker. */
export declare function streamConductorFoundation(engine: Engine, context: (teamId: string, operatorId: string) => CallContext): {
    recordAcknowledgedCommand(input: AcknowledgedProductionCommand): Promise<{
        command: string;
    }>;
};
