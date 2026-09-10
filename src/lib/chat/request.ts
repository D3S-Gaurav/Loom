import { z } from "zod";

export const MAX_CHAT_REQUEST_BYTES = 64 * 1024;

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4_000),
}).strict();

const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(12),
}).strict().superRefine(({ messages }, context) => {
  if (messages[0]?.role !== "user") {
    context.addIssue({ code: "custom", path: ["messages", 0, "role"], message: "Chat must start with a user message." });
  }
  if (messages.at(-1)?.role !== "user") {
    context.addIssue({ code: "custom", path: ["messages"], message: "The latest chat message must be from the user." });
  }
  messages.forEach((message, index) => {
    if (index > 0 && message.role === messages[index - 1].role) {
      context.addIssue({ code: "custom", path: ["messages", index, "role"], message: "Chat roles must alternate." });
    }
  });
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export class ChatRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatRequestError";
  }
}

export function parseChatRequest(value: unknown): { messages: ChatMessage[] } {
  const parsed = chatRequestSchema.safeParse(value);
  if (!parsed.success) {
    throw new ChatRequestError(parsed.error.issues[0]?.message ?? "Invalid chat request.");
  }
  return parsed.data;
}
