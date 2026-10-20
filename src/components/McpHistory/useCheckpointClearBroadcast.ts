/**
 * Cross-window clear for MCP checkpoints.
 *
 * Purpose: every document window keeps its own in-memory checkpoint list, so
 *   the window that clears the persisted store broadcasts; the others drop
 *   their lists instead of continuing to offer restores for deleted history.
 *
 * Key decisions:
 *   - The listener lives in the always-mounted history button, not inside the
 *     popover: a window with a closed popover must still hear the broadcast.
 *   - A failed listen is logged, never thrown — a missing event bridge costs
 *     cross-window consistency, not the editor.
 *
 * @coordinates-with components/McpHistory/McpHistoryStoreFooter.tsx — emits it
 * @module components/McpHistory/useCheckpointClearBroadcast
 */

import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useMcpStore } from "@/stores/mcpStore";
import { mcpBridgeError } from "@/utils/debug";

/** Emitted by the window that clears the checkpoint store. */
export const CHECKPOINTS_CLEARED_EVENT = "mcp:checkpoints-cleared";

/** Drop this window's in-memory checkpoints when any window clears the store. */
export function useCheckpointClearBroadcast(): void {
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    listen(CHECKPOINTS_CLEARED_EVENT, () => {
      if (!cancelled) useMcpStore.getState().checkpointClear();
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch((error) => {
        mcpBridgeError("Failed to listen for checkpoint clears:", error);
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
