import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AuthForm } from "@/components/AuthForm";
import { AuthSwarmGraph } from "@/components/AuthSwarmGraph";
import { AmbientRelayVideo } from "@/components/AmbientRelayVideo";
import { auth } from "@/lib/auth";
import { LoomBrand } from "@/components/ui/Brand";
import {
  ArrowUpRightIcon,
  CheckIcon,
  GitHubIcon,
  RadioIcon,
} from "@/components/ui/Icons";

export default async function SignInPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/");
  const mcpUrl = new URL("/api/mcp", process.env.APP_URL ?? "http://localhost:3000").toString();
  const codexConfig = `[mcp_servers.loom]\nurl = "${mcpUrl}"\nbearer_token_env_var = "LOOM_MCP_TOKEN"`;
  const claudeConfig = JSON.stringify({
    type: "http",
    url: mcpUrl,
    headers: { Authorization: "Bearer ${LOOM_MCP_TOKEN}" },
  });

  return (
    <main className="loom-auth-page">
      <section className="loom-auth-showcase" aria-labelledby="loom-auth-title">
        <div className="loom-auth-video" aria-hidden="true">
          <AmbientRelayVideo />
        </div>
        <div className="loom-auth-showcase-top">
          <LoomBrand tagline="Live agent swarm orchestration" />
          <a
            className="loom-auth-source"
            href="https://github.com/D3S-Gaurav/Loom"
            target="_blank"
            rel="noreferrer"
          >
            <GitHubIcon size={17} />
            GitHub
            <ArrowUpRightIcon size={15} />
          </a>
        </div>

        <div className="loom-auth-story">
          <div className="loom-live-label">
            <RadioIcon size={15} />
            Durable orchestration, visible live
          </div>
          <h1 id="loom-auth-title">One ambitious goal. A swarm that proves its work.</h1>
          <p>
            Loom plans the work, runs specialists in parallel, validates their output, and
            synthesizes one usable result—while you watch the complete execution graph unfold.
          </p>
        </div>

        <AuthSwarmGraph />

        <ul className="loom-auth-proof">
          <li><CheckIcon size={15} /> Temporal durability</li>
          <li><CheckIcon size={15} /> Redis replay</li>
          <li><CheckIcon size={15} /> Validated output</li>
        </ul>
      </section>

      <section className="loom-auth-entry" aria-label="Loom account access">
        <AuthForm />
        <p className="loom-auth-footnote">Secure sessions powered by Better Auth. Payments stay on Stripe.</p>
        <aside className="loom-auth-terminal" aria-label="Connect Codex or Claude Code through MCP">
          <header>
            <span className="loom-terminal-lights" aria-hidden="true"><i /><i /><i /></span>
            <strong>Loom MCP</strong>
            <span>Sign in to create token</span>
          </header>
          <div className="loom-terminal-body">
            <div>
              <b>Token</b>
              <code>export LOOM_MCP_TOKEN=&quot;&lt;token from Connect MCP&gt;&quot;</code>
            </div>
            <div>
              <b>Codex</b>
              <code>{codexConfig}</code>
            </div>
            <div>
              <b>Claude Code</b>
              <code>claude mcp add-json --scope user loom &apos;{claudeConfig}&apos;</code>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
