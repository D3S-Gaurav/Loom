"use client";

import { ChangeEvent, FormEvent, useEffect, useId, useRef, useState } from "react";
import { useSwarm } from "@/lib/store";
import { useRunSwarm } from "@/lib/useRunSwarm";
import {
  CloseIcon,
  GitHubIcon,
  LayersIcon,
  RocketIcon,
  SparklesIcon,
  WarningIcon,
} from "./ui/Icons";

const EXAMPLES = [
  { label: "Go-to-market plan", goal: "Create a go-to-market strategy for an AI code-review startup" },
  { label: "System architecture", goal: "Design a scalable architecture for a real-time multiplayer game" },
  { label: "Market brief", goal: "Write an investor-ready brief on the agentic AI market in 2026" },
  { label: "Product specification", goal: "Plan and spec a personal finance app with AI insights" },
];

const LIVE_EXAMPLES = [
  "Pressure-test a launch strategy and deliver a 30-day execution plan",
  "Audit this architecture, identify failure modes, and propose a migration path",
  "Research a market, challenge the assumptions, and write an investor-ready brief",
  "Turn a product idea into requirements, milestones, risks, and acceptance criteria",
];

const MAX_ATTACHMENTS = 4;
const MAX_TEXT_BYTES = 32 * 1024;
const MAX_TOTAL_TEXT_BYTES = 64 * 1024;
const MAX_IMAGE_BYTES = 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_REQUEST_BYTES = 3_000_000;
const TEXT_EXTENSIONS = new Set([
  "c", "cc", "cpp", "css", "csv", "go", "html", "java", "js", "json", "jsx", "md",
  "py", "rb", "rs", "sh", "sql", "text", "toml", "ts", "tsx", "txt", "xml", "yaml", "yml",
]);
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

type TextAttachment = {
  id: string;
  kind: "text";
  name: string;
  mediaType: string;
  content: string;
  size: number;
};

type ImageAttachment = {
  id: string;
  kind: "image";
  name: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  dataUrl: string;
  size: number;
};

type GitHubAttachment = {
  id: string;
  kind: "github";
  name: string;
  url: string;
};

type ComposerAttachment = TextAttachment | ImageAttachment | GitHubAttachment;

type GoalBarProps = {
  mode?: "onboarding" | "compact";
};

type SwarmDepth = "low" | "auto" | "max";

const SWARM_MODES: Array<{ value: SwarmDepth; label: string; detail: string }> = [
  { value: "low", label: "Low", detail: "Faster · smaller swarm" },
  { value: "auto", label: "Auto", detail: "Adapts depth to the goal" },
  { value: "max", label: "Max", detail: "Deeper · longer · larger swarm" },
];

function extensionOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
}

async function readText(file: File) {
  const bytes = await file.arrayBuffer();
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read this image."));
    reader.readAsDataURL(file);
  });
}

function parseGitHubRepository(value: string): { name: string; url: string } | null {
  const raw = value.trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname.toLowerCase() !== "github.com" ||
      parts.length !== 2 ||
      parsed.search ||
      parsed.hash
    ) return null;

    const owner = parts[0];
    const repo = parts[1];
    if (
      !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner) ||
      !/^[A-Za-z0-9._-]{1,100}$/.test(repo) ||
      repo.endsWith(".git")
    ) return null;
    return { name: `${owner}/${repo}`, url: `https://github.com/${owner}/${repo}` };
  } catch {
    return null;
  }
}

export function GoalBar({ mode = "compact" }: GoalBarProps) {
  const storedGoal = useSwarm((state) => state.goal);
  const [goal, setGoal] = useState(() => mode === "compact" ? storedGoal : "");
  const [swarmDepth, setSwarmDepth] = useState<SwarmDepth>("auto");
  const [focused, setFocused] = useState(false);
  const [exampleIndex, setExampleIndex] = useState(0);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [repoOpen, setRepoOpen] = useState(false);
  const [repoValue, setRepoValue] = useState("");
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileInputId = useId();
  const repoInputRef = useRef<HTMLInputElement>(null);
  const run = useRunSwarm();
  const runStatus = useSwarm((s) => s.runStatus);
  const planSummary = useSwarm((state) => state.planSummary);
  const busy = runStatus === "running";
  const onboarding = mode === "onboarding";

  useEffect(() => {
    if (!onboarding || goal || focused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const timer = window.setInterval(() => {
      setExampleIndex((current) => (current + 1) % LIVE_EXAMPLES.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [focused, goal, onboarding]);

  useEffect(() => {
    if (repoOpen) repoInputRef.current?.focus();
  }, [repoOpen]);

  const submit = (value: string) => {
    const cleanGoal = value.trim();
    if (cleanGoal.length < 4 || busy) return;

    const runAttachments = attachments.map((item) => {
      if (item.kind === "github") {
        return { kind: item.kind, name: item.name, url: item.url };
      }
      if (item.kind === "image") {
        return { kind: item.kind, name: item.name, mediaType: item.mediaType, dataUrl: item.dataUrl };
      }
      return { kind: item.kind, name: item.name, mediaType: item.mediaType, content: item.content };
    });
    const requestBytes = new TextEncoder().encode(JSON.stringify({
      goal: cleanGoal,
      attachments: runAttachments,
      mode: swarmDepth,
    })).byteLength;
    if (requestBytes > MAX_REQUEST_BYTES) {
      setAttachmentError("Attached context exceeds the 3 MB request limit. Remove one item and try again.");
      return;
    }
    setGoal(cleanGoal);
    run(cleanGoal, runAttachments, swarmDepth);
  };

  const addFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;

    const slots = MAX_ATTACHMENTS - attachments.length;
    if (slots <= 0) {
      setAttachmentError(`You can attach up to ${MAX_ATTACHMENTS} items.`);
      return;
    }

    const next: ComposerAttachment[] = [];
    let textBytes = attachments.reduce(
      (total, item) => total + (item.kind === "text" ? item.size : 0),
      0,
    );
    let imageBytes = attachments.reduce(
      (total, item) => total + (item.kind === "image" ? item.size : 0),
      0,
    );
    let error: string | null = files.length > slots
      ? `Only the first ${slots} file${slots === 1 ? "" : "s"} fit the ${MAX_ATTACHMENTS}-item limit.`
      : null;

    for (const file of files.slice(0, slots)) {
      if (file.name.length > 128 || /[\u0000-\u001f\u007f]/.test(file.name)) {
        error = "Attachment names must be 128 characters or fewer and contain no control characters.";
        continue;
      }
      const duplicate = [...attachments, ...next].some(
        (item) => item.kind !== "github" && item.name === file.name,
      );
      if (duplicate) {
        error = `${file.name} is already attached.`;
        continue;
      }

      if (IMAGE_TYPES.has(file.type)) {
        if (file.size > MAX_IMAGE_BYTES) {
          error = `${file.name} is larger than the 1 MB image limit.`;
          continue;
        }
        if (imageBytes + file.size > MAX_TOTAL_IMAGE_BYTES) {
          error = "Combined image attachments must be 2 MB or smaller.";
          continue;
        }
        try {
          next.push({
            id: crypto.randomUUID(),
            kind: "image",
            name: file.name,
            mediaType: file.type as ImageAttachment["mediaType"],
            dataUrl: await readDataUrl(file),
            size: file.size,
          });
          imageBytes += file.size;
        } catch {
          error = `Loom could not read ${file.name}.`;
        }
        continue;
      }

      const extension = extensionOf(file.name);
      const textLike = file.type.startsWith("text/") || file.type === "application/json" || TEXT_EXTENSIONS.has(extension);
      if (!textLike) {
        error = `${file.name} is not a supported text, code, or image file.`;
        continue;
      }
      if (file.size > MAX_TEXT_BYTES) {
        error = `${file.name} is larger than the 32 KB text limit.`;
        continue;
      }
      if (textBytes + file.size > MAX_TOTAL_TEXT_BYTES) {
        error = "Combined text and code attachments must be 64 KB or smaller.";
        continue;
      }

      try {
        next.push({
          id: crypto.randomUUID(),
          kind: "text",
          name: file.name,
          mediaType: file.type || "text/plain",
          content: await readText(file),
          size: file.size,
        });
        textBytes += file.size;
      } catch {
        error = `Loom could not read ${file.name}.`;
      }
    }

    setAttachments((current) => [...current, ...next].slice(0, MAX_ATTACHMENTS));
    setAttachmentError(error);
  };

  const addRepository = (event: FormEvent) => {
    event.preventDefault();
    const repository = parseGitHubRepository(repoValue);
    if (!repository) {
      setAttachmentError("Use a public repository URL like https://github.com/owner/repository.");
      return;
    }
    if (attachments.length >= MAX_ATTACHMENTS) {
      setAttachmentError(`You can attach up to ${MAX_ATTACHMENTS} items.`);
      return;
    }
    if (attachments.some((item) => item.kind === "github" && item.url === repository.url)) {
      setAttachmentError(`${repository.name} is already attached.`);
      return;
    }

    setAttachments((current) => [
      ...current,
      { id: crypto.randomUUID(), kind: "github", ...repository, name: repository.name.slice(0, 128) },
    ]);
    setRepoValue("");
    setRepoOpen(false);
    setAttachmentError(null);
  };

  return (
    <section
      className={`loom-goalbar${onboarding ? " is-onboarding" : ""}${busy ? " is-live" : ""}`}
      aria-labelledby="loom-goal-title"
    >
      <div className="loom-goalbar-head">
        <div>
          <span className="loom-section-icon"><SparklesIcon size={onboarding ? 19 : 16} /></span>
          <div>
            <h2 id="loom-goal-title">
              {onboarding ? "Describe the outcome" : "What should the swarm solve?"}
            </h2>
            <p>
              {onboarding
                ? "Add the context that matters. Loom will plan, delegate, verify, and synthesize the work."
                : "Give it a complex outcome. Loom will plan the path and verify the work."}
            </p>
          </div>
        </div>
        <span className={`loom-key-hint${busy ? " is-live" : ""}`} aria-live="polite">
          {busy ? "Live orchestration" : "⌘ ↵ to deploy"}
        </span>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(goal);
        }}
        className="loom-goalform"
      >
        <div className="loom-composer-field">
          <textarea
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                submit(goal);
              }
            }}
            className="loom-input"
            disabled={busy}
            rows={onboarding ? 3 : 2}
            maxLength={2000}
            aria-label="Swarm goal"
            aria-describedby={attachmentError ? "loom-attachment-error" : undefined}
          />
          {onboarding && !goal && !focused ? (
            <span className="loom-live-example" key={exampleIndex} aria-hidden="true">
              {LIVE_EXAMPLES[exampleIndex]}
            </span>
          ) : null}
          <span className="loom-character-count" aria-live="off">{goal.length}/2000</span>
        </div>

        <button
          type="submit"
          className="loom-primary-button loom-deploy"
          disabled={busy || goal.trim().length < 4}
        >
          {busy
            ? <><span className="loom-button-loader" />Swarming…</>
            : <><RocketIcon size={18} />Deploy swarm</>}
        </button>
      </form>

      <div className="loom-attachment-tools">
        <input
          id={fileInputId}
          className="loom-file-input"
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif,text/*,.json,.md,.csv,.js,.jsx,.ts,.tsx,.py,.go,.rs,.java,.c,.cc,.cpp,.sql,.yaml,.yml,.toml"
          onChange={addFiles}
          disabled={busy || attachments.length >= MAX_ATTACHMENTS}
        />
        <label className="loom-attachment-button" htmlFor={fileInputId} aria-disabled={busy || attachments.length >= MAX_ATTACHMENTS}>
          <LayersIcon size={15} /> Add files
        </label>
        <button
          className="loom-attachment-button"
          type="button"
          onClick={() => setRepoOpen((open) => !open)}
          disabled={busy || attachments.length >= MAX_ATTACHMENTS}
          aria-expanded={repoOpen}
        >
          <GitHubIcon size={15} /> GitHub repository
        </button>
        <span className="loom-attachment-limits">4 items · text 32 KB each · images 1 MB each · 3 MB request</span>
      </div>

      <div className="loom-mode-row">
        <fieldset className="loom-mode-selector">
          <legend>Swarm depth</legend>
          {SWARM_MODES.map((option) => (
            <label key={option.value}>
              <input
                type="radio"
                name={`swarm-depth-${fileInputId}`}
                value={option.value}
                checked={swarmDepth === option.value}
                onChange={() => setSwarmDepth(option.value)}
                disabled={busy}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>
        <p>{SWARM_MODES.find((option) => option.value === swarmDepth)?.detail}</p>
      </div>

      {repoOpen ? (
        <form className="loom-repo-form" onSubmit={addRepository}>
          <GitHubIcon size={16} />
          <label htmlFor="loom-repository-url" className="loom-sr-only">Public GitHub repository URL</label>
          <input
            ref={repoInputRef}
            id="loom-repository-url"
            type="url"
            value={repoValue}
            onChange={(event) => setRepoValue(event.target.value)}
            placeholder="https://github.com/owner/repository"
            maxLength={300}
          />
          <button type="submit" disabled={!repoValue.trim()}>Attach</button>
        </form>
      ) : null}

      {attachments.length ? (
        <ul className="loom-attachments" aria-label="Attached context">
          {attachments.map((item) => (
            <li key={item.id}>
              {item.kind === "github" ? <GitHubIcon size={14} /> : <LayersIcon size={14} />}
              <span>
                <strong>{item.name}</strong>
                <small>
                  {item.kind === "github"
                    ? "Public repository"
                    : item.kind === "image"
                      ? `${formatBytes(item.size)} · analyzed as visual context`
                      : `${formatBytes(item.size)} · included as text context`}
                </small>
              </span>
              <button
                type="button"
                onClick={() => {
                  setAttachments((current) => current.filter((attachment) => attachment.id !== item.id));
                  setAttachmentError(null);
                }}
                aria-label={`Remove ${item.name}`}
              >
                <CloseIcon size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {attachmentError ? (
        <p className="loom-attachment-error" id="loom-attachment-error" role="alert">
          <WarningIcon size={14} /> {attachmentError}
        </p>
      ) : null}
      {busy && !planSummary ? (
        <div className="loom-launch-relay" role="status" aria-live="polite">
          <span aria-hidden="true"><i /><i /><i /></span>
          Securing context and planning the first handoffs…
        </div>
      ) : null}

      <div className="loom-goalbar-foot">
        <div className="loom-examples" aria-label="Example goals">
          {EXAMPLES.map((example) => (
            <button
              key={example.label}
              className="loom-chip"
              onClick={() => setGoal(example.goal)}
              disabled={busy}
              type="button"
            >
              {example.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
