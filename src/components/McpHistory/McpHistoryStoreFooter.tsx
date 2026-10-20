/**
 * Purpose: footer of the MCP history popover — reports how much checkpoint
 *   data is on disk and clears the whole store, for every file and window.
 *
 * Key decisions:
 *   - This lives in the history popover, not Settings: the Settings window is
 *     filesystem-free by capability, while this window already owns the
 *     checkpoint file. The issue's goal is a visible, clearable store; the
 *     location follows the access boundary.
 *   - Clear-all removes the file's lines and emits a cross-window event, so
 *     other windows drop their in-memory lists too.
 *   - The size shown is the file on disk (JSON overhead included), not the
 *     retention sum — it answers "what did VMark write to my disk".
 *
 * @coordinates-with stores/mcpCheckpointPersistence.ts — size, clear, hardening
 * @coordinates-with components/McpHistory/useCheckpointClearBroadcast.ts — event
 * @module components/McpHistory/McpHistoryStoreFooter
 */

import { useCallback, useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { useMcpStore } from "@/stores/mcpStore";
import {
  checkpointStoreInfo,
  clearCheckpointsOnDisk,
} from "@/stores/mcpCheckpointPersistence";
import type { CheckpointStoreInfo } from "@/stores/mcpCheckpointPersistence";
import { formatFileSize } from "@/utils/fileSizeThresholds";
import { imeToast as toast } from "@/services/ime/imeToast";
import { mcpBridgeError } from "@/utils/debug";
import { CHECKPOINTS_CLEARED_EVENT } from "./useCheckpointClearBroadcast";

interface McpHistoryStoreFooterProps {
  /** Total checkpoints held for all files and tabs, not just the focused one. */
  count: number;
}

export function McpHistoryStoreFooter({
  count,
}: McpHistoryStoreFooterProps): React.ReactElement {
  const { t } = useTranslation("statusbar");
  const [info, setInfo] = useState<CheckpointStoreInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    void checkpointStoreInfo()
      .then((next) => {
        if (!cancelled) setInfo(next);
      })
      .catch((error) =>
        mcpBridgeError("Failed to read the MCP checkpoint store:", error),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  const onClearAll = useCallback(async () => {
    // Memory first: the button's own window should update even if disk fails.
    useMcpStore.getState().checkpointClear();
    await clearCheckpointsOnDisk();
    await emit(CHECKPOINTS_CLEARED_EVENT).catch((error) =>
      mcpBridgeError("Failed to broadcast the checkpoint clear:", error),
    );
    try {
      setInfo(await checkpointStoreInfo());
    } catch (error) {
      mcpBridgeError("Failed to refresh the MCP checkpoint store:", error);
    }
    toast.success(t("mcpHistoryClearedAll"));
  }, [t]);

  const size = info ? formatFileSize(info.sizeBytes) : "—";

  return (
    <footer className="mcp-history-popover__footer">
      <div className="mcp-history-popover__store">
        <span>{t("mcpHistoryStoreSummary", { count, size })}</span>
        <span className="mcp-history-popover__store-hint">
          {t("mcpHistoryStoreHint")}
        </span>
      </div>
      <button
        type="button"
        className="vm-btn vm-btn--danger vm-btn--compact"
        onClick={() =>
          void onClearAll().catch((error) =>
            mcpBridgeError("Failed to clear all MCP checkpoints:", error),
          )
        }
        disabled={count === 0}
      >
        {t("mcpHistoryClearAll")}
      </button>
    </footer>
  );
}
