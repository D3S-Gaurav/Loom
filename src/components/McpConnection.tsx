"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, CloseIcon, LockIcon, RadioIcon, TrashIcon } from "./ui/Icons";

interface McpTokenStatus {
  configured: boolean;
  prefix?: string | null;
  createdAt?: string | null;
  lastUsedAt?: string | null;
}

interface CreatedMcpToken {
  token: string;
  prefix: string;
  createdAt: string;
}

type CopyTarget = "token" | "codex" | "claude";

function formatDate(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

async function readError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

export function McpConnection({
  initialStatus,
}: {
  initialStatus: Pick<McpTokenStatus, "configured" | "lastUsedAt">;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const [status, setStatus] = useState<McpTokenStatus>(initialStatus);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [error, setError] = useState("");

  const mcpUrl = `${origin}/api/mcp`;
  const codexConfig = `[mcp_servers.loom]\nurl = "${mcpUrl}"\nbearer_token_env_var = "LOOM_MCP_TOKEN"`;
  const claudeConfig = JSON.stringify({
    type: "http",
    url: mcpUrl,
    headers: { Authorization: "Bearer ${LOOM_MCP_TOKEN}" },
  });
  const claudeCommand = `claude mcp add-json --scope user loom '${claudeConfig}'`;
  const connectionLabel = !status.configured
    ? "Connect MCP"
    : status.lastUsedAt
      ? "MCP connected"
      : "MCP ready";

  async function loadStatus() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/mcp/token", { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response, "Unable to load MCP access."));
      setStatus((await response.json()) as McpTokenStatus);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function openDialog() {
    setOrigin(window.location.origin);
    setOpen(true);
    setToken("");
    setCopied(null);
    setConfirmRevoke(false);
    void loadStatus();
  }

  function closeDialog() {
    dialogRef.current?.close();
    setOpen(false);
    setToken("");
    setError("");
    setConfirmRevoke(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog || dialog.open) return;
    dialog.showModal();
    window.setTimeout(() => closeRef.current?.focus(), 0);
  }, [open]);

  async function createToken() {
    setMutating(true);
    setError("");
    try {
      const response = await fetch("/api/mcp/token", { method: "POST" });
      if (!response.ok) throw new Error(await readError(response, "Unable to create MCP access."));
      const created = (await response.json()) as CreatedMcpToken;
      setToken(created.token);
      setStatus({ configured: true, prefix: created.prefix, createdAt: created.createdAt });
    } catch (createError) {
      setError((createError as Error).message);
    } finally {
      setMutating(false);
    }
  }

  async function revokeToken() {
    setMutating(true);
    setError("");
    try {
      const response = await fetch("/api/mcp/token", { method: "DELETE" });
      if (!response.ok) throw new Error(await readError(response, "Unable to revoke MCP access."));
      setStatus({ configured: false });
      setToken("");
      setConfirmRevoke(false);
    } catch (revokeError) {
      setError((revokeError as Error).message);
    } finally {
      setMutating(false);
    }
  }

  async function copy(value: string, target: CopyTarget) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(target);
      window.setTimeout(() => setCopied((current) => current === target ? null : current), 1800);
    } catch {
      setError("Clipboard access was blocked. Select and copy the text manually.");
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        className={`loom-mcp-trigger${status.configured ? " is-connected" : ""}`}
        type="button"
        onClick={openDialog}
        aria-haspopup="dialog"
        aria-label={`${connectionLabel}. Open MCP connection settings.`}
      >
        <RadioIcon size={16} />
        <span>{connectionLabel}</span>
      </button>

      <dialog
        ref={dialogRef}
        className="loom-mcp-dialog"
        aria-labelledby="loom-mcp-title"
        aria-describedby="loom-mcp-description"
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
      >
        <div className="loom-mcp-panel">
          <header className="loom-mcp-head">
            <span className="loom-mcp-icon"><RadioIcon size={18} /></span>
            <div>
              <h2 id="loom-mcp-title">Connect your CLI</h2>
              <p id="loom-mcp-description">Give Codex or Claude read-only access to Loom results.</p>
            </div>
            <button ref={closeRef} className="loom-mcp-close" type="button" onClick={closeDialog} aria-label="Close MCP connection dialog">
              <CloseIcon size={18} />
            </button>
          </header>

          <div className="loom-mcp-body">
            <section className="loom-mcp-scope" aria-label="Token scope">
              <div>
                <span className="loom-mcp-status-dot" />
                <strong>Account-wide · Read-only</strong>
              </div>
              <p>This token can list retained runs and read their final deliverables. It cannot start, edit, or delete runs.</p>
            </section>

            {error ? (
              <div className="loom-mcp-error" role="alert">
                <span>{error}</span>
                {!mutating ? <button type="button" onClick={() => void loadStatus()}>Retry</button> : null}
              </div>
            ) : null}

            {loading ? (
              <div className="loom-mcp-loading" role="status" aria-live="polite">
                <span className="loom-button-loader" /> Checking MCP access…
              </div>
            ) : !status.configured ? (
              <section className="loom-mcp-empty">
                <LockIcon size={19} />
                <div>
                  <strong>No active MCP token</strong>
                  <p>Create one account-wide credential. Loom will show the secret once.</p>
                </div>
                <button className="loom-mcp-primary" type="button" onClick={() => void createToken()} disabled={mutating}>
                  {mutating ? <><span className="loom-button-loader" /> Creating…</> : "Create token"}
                </button>
              </section>
            ) : status.configured ? (
              <>
                <section className="loom-mcp-credential" aria-label="Active token">
                  <div className="loom-mcp-credential-head">
                    <span><CheckIcon size={16} /> Active token</span>
                    <code>{status.prefix ?? "Configured"}</code>
                  </div>
                  <dl>
                    <div><dt>Created</dt><dd>{formatDate(status.createdAt)}</dd></div>
                    <div><dt>Last used</dt><dd>{formatDate(status.lastUsedAt)}</dd></div>
                  </dl>
                </section>

                {token ? (
                  <section className="loom-mcp-secret" aria-label="New token secret">
                    <div>
                      <strong>Copy this token now</strong>
                      <span>It will not be shown again after you close this window.</span>
                    </div>
                    <div className="loom-mcp-code-row">
                      <code>{token}</code>
                      <button type="button" onClick={() => void copy(token, "token")}>{copied === "token" ? "Copied" : "Copy token"}</button>
                    </div>
                  </section>
                ) : (
                  <p className="loom-mcp-once-note">The full secret is hidden. Revoke this token and create a new one to connect another CLI.</p>
                )}

                <section className="loom-mcp-setup" aria-labelledby="loom-mcp-setup-title">
                  <div className="loom-mcp-setup-head">
                    <div>
                      <h3 id="loom-mcp-setup-title">CLI setup</h3>
                      <p>Use the same account token with either client.</p>
                    </div>
                    <span className="loom-mcp-url">{mcpUrl}</span>
                  </div>

                  <div className="loom-mcp-snippet">
                    <div><strong>Codex</strong><span>Add this to <code>~/.codex/config.toml</code>, then export <code>LOOM_MCP_TOKEN</code>.</span></div>
                    <pre><code>{codexConfig}</code></pre>
                    <button type="button" onClick={() => void copy(codexConfig, "codex")}>{copied === "codex" ? "Copied" : "Copy config"}</button>
                  </div>

                  <div className="loom-mcp-snippet">
                    <div><strong>Claude Code</strong><span>Export <code>LOOM_MCP_TOKEN</code>, then run this command.</span></div>
                    <pre><code>{claudeCommand}</code></pre>
                    <button type="button" onClick={() => void copy(claudeCommand, "claude")}>{copied === "claude" ? "Copied" : "Copy command"}</button>
                  </div>
                </section>
              </>
            ) : null}
          </div>

          <footer className="loom-mcp-foot">
            <span className="loom-mcp-a11y-status" aria-live="polite">
              {copied ? `${copied === "token" ? "Token" : copied === "codex" ? "Codex config" : "Claude command"} copied to clipboard.` : ""}
            </span>
            {status.configured ? (
              confirmRevoke ? (
                <div className="loom-mcp-confirm" role="group" aria-label="Confirm token revocation">
                  <span>Connected CLIs will lose access.</span>
                  <button type="button" onClick={() => setConfirmRevoke(false)} disabled={mutating}>Keep access</button>
                  <button className="is-danger" type="button" onClick={() => void revokeToken()} disabled={mutating}>
                    {mutating ? "Revoking…" : "Revoke now"}
                  </button>
                </div>
              ) : (
                <button className="loom-mcp-revoke" type="button" onClick={() => setConfirmRevoke(true)}>
                  <TrashIcon size={15} /> Revoke token
                </button>
              )
            ) : <span />}
            {!confirmRevoke ? <button className="loom-mcp-done" type="button" onClick={closeDialog}>Done</button> : null}
          </footer>
        </div>
      </dialog>
    </>
  );
}
