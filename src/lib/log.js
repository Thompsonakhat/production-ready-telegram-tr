export function safeErr(err) {
  return err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || String(err);
}

export const log = {
  info(message, meta = {}) {
    console.log(JSON.stringify({ level: "info", message, ...meta }));
  },
  warn(message, meta = {}) {
    console.warn(JSON.stringify({ level: "warn", message, ...meta }));
  },
  error(message, meta = {}) {
    console.error(JSON.stringify({ level: "error", message, ...meta }));
  }
};

export function publicUser(ctx) {
  return {
    userId: ctx?.from?.id ? String(ctx.from.id) : "unknown",
    chatId: ctx?.chat?.id ? String(ctx.chat.id) : "unknown"
  };
}
