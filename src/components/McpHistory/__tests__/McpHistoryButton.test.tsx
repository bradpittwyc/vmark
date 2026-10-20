// McpHistoryButton — render, popover toggle, restore action.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/services/persistence/workspaceStorage", () => ({
  getCurrentWindowLabel: () => "main",
}));

const persistenceMocks = vi.hoisted(() => ({
  rewriteAll: vi.fn(async () => undefined),
  clearCheckpointsOnDisk: vi.fn(async () => undefined),
  checkpointStoreInfo: vi.fn(async () => ({
    path: "/app/data/mcp-checkpoints.jsonl",
    sizeBytes: 2048,
  })),
}));
vi.mock("@/stores/mcpCheckpointPersistence", () => persistenceMocks);

const eventMocks = vi.hoisted(() => {
  let handler: (() => void) | null = null;
  return {
    emit: vi.fn(async () => undefined),
    listen: vi.fn(async (_event: string, cb: () => void) => {
      handler = cb;
      return () => {
        handler = null;
      };
    }),
    fire: () => handler?.(),
    reset: () => {
      handler = null;
    },
  };
});
vi.mock("@tauri-apps/api/event", () => ({
  emit: eventMocks.emit,
  listen: eventMocks.listen,
}));

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/services/ime/imeToast", () => ({
  imeToast: toastMock,
}));

import { useMcpStore } from "@/stores/mcpStore";
import { useTabStore } from "@/stores/tabStore";
import { useDocumentStore } from "@/stores/documentStore";
import { McpHistoryButton } from "../McpHistoryButton";

function reset() {
  useMcpStore.setState((s) => ({
    checkpoint: { ...s.checkpoint, checkpoints: [], hydrated: false },
  }));
  useTabStore.setState({
    tabs: {
      main: [
        {
          id: "tab-1",
          filePath: "/notes.md",
          title: "notes",
          isPinned: false,
        },
      ],
    },
    activeTabId: { main: "tab-1" },
    untitledCounter: 0,
    closedTabs: {},
  });
  useDocumentStore.setState({ documents: {} });
  useDocumentStore.getState().initDocument("tab-1", "current", "/notes.md");
  toastMock.success.mockClear();
  toastMock.error.mockClear();
  persistenceMocks.clearCheckpointsOnDisk.mockClear();
  persistenceMocks.checkpointStoreInfo.mockClear();
  eventMocks.emit.mockClear();
  eventMocks.listen.mockClear();
  eventMocks.reset();
}

function seedCheckpoint(overrides: Partial<{ contentBefore: string }> = {}) {
  return useMcpStore.getState().checkpointPush({
    tabId: "tab-1",
    filePath: "/notes.md",
    tool: "document.write",
    description: "AI rewrote document",
    contentBefore: overrides.contentBefore ?? "before",
    revisionBefore: "rev-A",
    revisionAfter: "rev-B",
  });
}

describe("McpHistoryButton", () => {
  beforeEach(reset);

  it("shows no badge when there are no checkpoints", () => {
    render(<McpHistoryButton />);
    const btn = screen.getByRole("button", { name: /MCP write history/i });
    expect(btn).toBeInTheDocument();
    expect(btn.querySelector(".status-mcp-history__badge")).toBeNull();
  });

  it("shows a badge with count when checkpoints exist", () => {
    seedCheckpoint();
    seedCheckpoint();
    render(<McpHistoryButton />);
    const btn = screen.getByRole("button", { name: /MCP write history/i });
    expect(btn.querySelector(".status-mcp-history__badge")?.textContent).toBe(
      "2",
    );
  });

  it("opens the popover and shows checkpoint rows on click", async () => {
    seedCheckpoint({ contentBefore: "first" });
    const user = userEvent.setup();
    render(<McpHistoryButton />);
    await user.click(
      screen.getByRole("button", { name: /MCP write history/i }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("AI rewrote document")).toBeInTheDocument();
  });

  it("restores content when the row's restore button is clicked", async () => {
    seedCheckpoint({ contentBefore: "previous content" });
    const user = userEvent.setup();
    render(<McpHistoryButton />);
    await user.click(
      screen.getByRole("button", { name: /MCP write history/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /Restore to before this write/i }),
    );

    expect(useDocumentStore.getState().documents["tab-1"].content).toBe(
      "previous content",
    );
    expect(toastMock.success).toHaveBeenCalled();
  });

  it("filters checkpoints by the focused tab's filePath", () => {
    seedCheckpoint({ contentBefore: "for-this-tab" });
    // Push a checkpoint for a different file path.
    useMcpStore.getState().checkpointPush({
      tabId: "tab-2",
      filePath: "/other.md",
      tool: "document.write",
      description: "elsewhere",
      contentBefore: "x",
      revisionBefore: "rev-A",
      revisionAfter: "rev-B",
    });
    render(<McpHistoryButton />);
    const btn = screen.getByRole("button", { name: /MCP write history/i });
    // Only the /notes.md checkpoint counts toward this tab's badge.
    expect(btn.querySelector(".status-mcp-history__badge")?.textContent).toBe(
      "1",
    );
  });

  it("clear button wipes history for the focused tab only", async () => {
    seedCheckpoint();
    useMcpStore.getState().checkpointPush({
      tabId: "tab-2",
      filePath: "/other.md",
      tool: "document.write",
      description: "elsewhere",
      contentBefore: "x",
      revisionBefore: "rev-A",
      revisionAfter: "rev-B",
    });
    const user = userEvent.setup();
    render(<McpHistoryButton />);
    await user.click(
      screen.getByRole("button", { name: /MCP write history/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /Clear history for this tab/i }),
    );
    const remaining = useMcpStore.getState().checkpoint.checkpoints;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].filePath).toBe("/other.md");
  });

  it("shows the on-disk store size and a clear-all action", async () => {
    seedCheckpoint();
    const user = userEvent.setup();
    render(<McpHistoryButton />);
    await user.click(
      screen.getByRole("button", { name: /MCP write history/i }),
    );

    expect(await screen.findByText(/2\.0 KB on disk/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Clear all checkpoint history/i }),
    ).toBeInTheDocument();
  });

  it("clear all wipes every checkpoint on disk and tells other windows", async () => {
    seedCheckpoint();
    useMcpStore.getState().checkpointPush({
      tabId: "tab-2",
      filePath: "/other.md",
      tool: "document.write",
      description: "elsewhere",
      contentBefore: "x",
      revisionBefore: "rev-A",
      revisionAfter: "rev-B",
    });
    const user = userEvent.setup();
    render(<McpHistoryButton />);
    await user.click(
      screen.getByRole("button", { name: /MCP write history/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /Clear all checkpoint history/i }),
    );

    expect(useMcpStore.getState().checkpoint.checkpoints).toHaveLength(0);
    expect(persistenceMocks.clearCheckpointsOnDisk).toHaveBeenCalledWith();
    expect(eventMocks.emit).toHaveBeenCalledWith("mcp:checkpoints-cleared");
    expect(toastMock.success).toHaveBeenCalled();
  });

  it("drops this window's in-memory history when another window clears the store", async () => {
    seedCheckpoint();
    render(<McpHistoryButton />);
    await waitFor(() => expect(eventMocks.listen).toHaveBeenCalled());

    eventMocks.fire();

    expect(useMcpStore.getState().checkpoint.checkpoints).toHaveLength(0);
  });
});
