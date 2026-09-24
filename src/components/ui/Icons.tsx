import type { SVGProps } from "react";
import type { AgentType } from "@/lib/swarm/types";

export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 18, children, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {children}
    </svg>
  );
}

const strokeProps = {
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  strokeWidth: 1.8,
};

export function ArrowUpRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 17 17 7M8 7h9v9" {...strokeProps} />
    </Icon>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m10 6-6 6 6 6M4 12h16" {...strokeProps} />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12.5 4.2 4.2L19 7" {...strokeProps} />
    </Icon>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.5 5h13A2.5 2.5 0 0 1 21 7.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-5.5 3v-3.6A2.5 2.5 0 0 1 3 15V7.5A2.5 2.5 0 0 1 5.5 5Z" {...strokeProps} />
      <path d="M7.5 10h9M7.5 13.5h5.5" {...strokeProps} />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m7 10 5 5 5-5" {...strokeProps} />
    </Icon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.25" {...strokeProps} />
      <path d="M12 7.8v4.7l3 1.8" {...strokeProps} />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 6 12 12M18 6 6 18" {...strokeProps} />
    </Icon>
  );
}

export function CreditCardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" {...strokeProps} />
      <path d="M4 9.5h16M7 15h3" {...strokeProps} />
    </Icon>
  );
}

export function GitHubIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M12 2.9a9.2 9.2 0 0 0-2.9 17.9c.46.08.63-.2.63-.45v-1.77c-2.57.56-3.11-1.1-3.11-1.1-.42-1.07-1.03-1.35-1.03-1.35-.84-.58.06-.57.06-.57.93.07 1.42.96 1.42.96.83 1.42 2.17 1.01 2.7.77.08-.6.32-1.01.59-1.25-2.05-.23-4.21-1.03-4.21-4.57 0-1.01.36-1.84.95-2.49-.1-.23-.41-1.18.09-2.46 0 0 .78-.25 2.53.95A8.8 8.8 0 0 1 12 7.16a8.7 8.7 0 0 1 2.3.31c1.76-1.2 2.53-.95 2.53-.95.5 1.28.19 2.23.1 2.46.59.65.95 1.48.95 2.49 0 3.55-2.16 4.33-4.22 4.56.33.29.63.85.63 1.72v2.6c0 .25.16.54.63.45A9.2 9.2 0 0 0 12 2.9Z"
        fill="currentColor"
      />
    </Icon>
  );
}

export function LayersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12 3.7 8 4.2-8 4.2-8-4.2 8-4.2Z" {...strokeProps} />
      <path d="m4.5 12 7.5 4 7.5-4M4.5 16l7.5 4 7.5-4" {...strokeProps} />
    </Icon>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5" y="10" width="14" height="10" rx="2.5" {...strokeProps} />
      <path d="M8.3 10V7.8a3.7 3.7 0 0 1 7.4 0V10M12 14.2v2.2" {...strokeProps} />
    </Icon>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 5H6.5A2.5 2.5 0 0 0 4 7.5v9A2.5 2.5 0 0 0 6.5 19H10" {...strokeProps} />
      <path d="m14 8 4 4-4 4M18 12H9" {...strokeProps} />
    </Icon>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" {...strokeProps} />
      <path d="m5 7 7 5.5L19 7" {...strokeProps} />
    </Icon>
  );
}

export function MaximizeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 4H4v5M15 4h5v5M20 15v5h-5M9 20H4v-5" {...strokeProps} />
    </Icon>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v11M7.5 10.5 12 15l4.5-4.5M5 19h14" {...strokeProps} />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" {...strokeProps} />
    </Icon>
  );
}

export function RadioIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.2 5.2a9.6 9.6 0 0 0 0 13.6M18.8 5.2a9.6 9.6 0 0 1 0 13.6" {...strokeProps} />
    </Icon>
  );
}

export function RocketIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13.7 4.2c2.1-1.2 4.2-.9 5.9-.6.3 1.7.6 3.8-.6 5.9l-5.6 7-5.9-5.9 6.2-6.4Z" {...strokeProps} />
      <circle cx="15.5" cy="7.6" r="1.5" {...strokeProps} />
      <path d="M8.5 9.6 5 10.1l-2 2 4.1 1M14 16.1l-1 4.1-2 1.9-.8-4.3M7.4 16.6c-1.5.1-2.6 1.2-2.8 2.8 1.6-.2 2.7-1.3 2.8-2.8Z" {...strokeProps} />
    </Icon>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m3.5 4 17 8-17 8 3-8-3-8Z" {...strokeProps} />
      <path d="M6.5 12h14" {...strokeProps} />
    </Icon>
  );
}

export function SparklesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 2.8c.5 4.8 2.4 6.7 7.2 7.2-4.8.5-6.7 2.4-7.2 7.2-.5-4.8-2.4-6.7-7.2-7.2 4.8-.5 6.7-2.4 7.2-7.2Z" {...strokeProps} />
      <path d="M19 15.5c.2 2.3 1.2 3.3 3.5 3.5-2.3.2-3.3 1.2-3.5 3.5-.2-2.3-1.2-3.3-3.5-3.5 2.3-.2 3.3-1.2 3.5-3.5Z" {...strokeProps} />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 7h14M9 7V4.5h6V7M7.2 7l.7 13h8.2l.7-13M10 11v5M14 11v5" {...strokeProps} />
    </Icon>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3.5" {...strokeProps} />
      <path d="M5.2 20c.5-3.4 3.1-5.5 6.8-5.5s6.3 2.1 6.8 5.5" {...strokeProps} />
    </Icon>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10.3 4.3 2.8 18a2 2 0 0 0 1.8 3h14.8a2 2 0 0 0 1.8-3L13.7 4.3a2 2 0 0 0-3.4 0Z" {...strokeProps} />
      <path d="M12 9v4M12 17h.01" {...strokeProps} />
    </Icon>
  );
}

export function AgentIcon({ type, ...props }: IconProps & { type: AgentType }) {
  const content: Record<AgentType, React.ReactNode> = {
    planner: <path d="M12 3 5 7v5c0 4.5 2.8 7.4 7 9 4.2-1.6 7-4.5 7-9V7l-7-4Zm0 4v10M8 10l4-3 4 3" {...strokeProps} />,
    researcher: <><circle cx="10.5" cy="10.5" r="5.5" {...strokeProps} /><path d="m15 15 4.5 4.5M8.2 10.5h4.6M10.5 8.2v4.6" {...strokeProps} /></>,
    analyst: <path d="M5 19V9M12 19V4M19 19v-6M3 19h18" {...strokeProps} />,
    writer: <path d="m4 20 4.2-1 10-10a2.8 2.8 0 0 0-4-4l-10 10L4 20Zm9-13 4 4M8.2 19 4 15" {...strokeProps} />,
    coder: <path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5M13.5 4 10 20" {...strokeProps} />,
    validator: <path d="M12 3 5 6v6c0 4.3 2.8 7.4 7 9 4.2-1.6 7-4.7 7-9V6l-7-3Zm-3.5 9 2.3 2.3 4.8-5" {...strokeProps} />,
    synthesizer: <path d="M4 7h4c5 0 3 10 8 10h4M4 17h4c5 0 3-10 8-10h4M17 4l3 3-3 3M17 14l3 3-3 3" {...strokeProps} />,
  };

  return <Icon {...props}>{content[type]}</Icon>;
}
