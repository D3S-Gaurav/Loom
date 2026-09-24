"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { ChevronDownIcon, LogOutIcon, UserIcon } from "./ui/Icons";

export function UserMenu({ name, email }: { name: string; email: string }) {
  const router = useRouter();

  return (
    <details className="loom-user">
      <summary aria-label="Open account menu">
        <span className="loom-avatar">{name.trim().charAt(0).toUpperCase() || <UserIcon size={16} />}</span>
        <span className="loom-user-summary">
          <strong>{name}</strong>
          <small>Account</small>
        </span>
        <ChevronDownIcon size={14} />
      </summary>
      <div className="loom-popover loom-user-popover">
        <div className="loom-user-identity">
          <span className="loom-avatar is-large">{name.trim().charAt(0).toUpperCase() || <UserIcon size={18} />}</span>
          <div><strong>{name}</strong><span>{email}</span></div>
        </div>
        <button
          onClick={async () => {
            await authClient.signOut();
            router.push("/sign-in");
            router.refresh();
          }}
        >
          <LogOutIcon size={16} />Sign out
        </button>
      </div>
    </details>
  );
}
