"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { LockIcon, MailIcon, RocketIcon, UserIcon } from "./ui/Icons";

type Mode = "sign-in" | "sign-up";

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const result =
        mode === "sign-up"
          ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
          : await authClient.signIn.email({ email: email.trim(), password });

      if (result.error) {
        setError(result.error.message ?? "We could not authenticate this account.");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Loom could not reach the authentication service. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setError(null);
  }

  return (
    <div className="loom-auth-card">
      <div className="loom-auth-card-head">
        <span className="loom-auth-icon"><RocketIcon size={20} /></span>
        <div>
          <h2>{mode === "sign-in" ? "Welcome back" : "Create your workspace"}</h2>
          <p>
            {mode === "sign-in"
              ? "Continue orchestrating and replaying your swarms."
              : "Start with 3 durable swarm runs every hour, including 1 Max run."}
          </p>
        </div>
      </div>

      <div className="loom-auth-tabs" role="tablist" aria-label="Authentication mode">
        <button
          aria-selected={mode === "sign-in"}
          className={mode === "sign-in" ? "is-active" : ""}
          onClick={() => changeMode("sign-in")}
          role="tab"
          type="button"
        >
          Sign in
        </button>
        <button
          aria-selected={mode === "sign-up"}
          className={mode === "sign-up" ? "is-active" : ""}
          onClick={() => changeMode("sign-up")}
          role="tab"
          type="button"
        >
          Create account
        </button>
      </div>

      <form onSubmit={submit} className="loom-auth-form">
        {mode === "sign-up" && (
          <label>
            <span>Name</span>
            <span className="loom-field">
              <UserIcon size={17} />
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                placeholder="Your name"
                required
                minLength={2}
              />
            </span>
          </label>
        )}
        <label>
          <span>Email</span>
          <span className="loom-field">
            <MailIcon size={17} />
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              required
            />
          </span>
        </label>
        <label>
          <span>Password</span>
          <span className="loom-field">
            <LockIcon size={17} />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              placeholder={mode === "sign-up" ? "At least 8 characters" : "Your password"}
              required
              minLength={8}
            />
          </span>
        </label>
        {error && <p className="loom-auth-error" role="alert">{error}</p>}
        <button type="submit" className="loom-primary-button" disabled={busy} aria-busy={busy}>
          {busy ? (
            <><span className="loom-button-loader" />Connecting…</>
          ) : (
            <>{mode === "sign-up" ? "Create account" : "Sign in"}<RocketIcon size={17} /></>
          )}
        </button>
      </form>
    </div>
  );
}
