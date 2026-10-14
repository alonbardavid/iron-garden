import { useEffect } from "react";
import type { Range } from "../diff/model";
import { useChat } from "./ChatProvider";

// While a comment is being written on lines, the chat gets those lines as
// context, and an ask on them goes to the chat. `ask` is null while no agent
// listens; the whole result is null without a chat.
export function useChatSelection(path: string, range: Range) {
  const chat = useChat();
  const setSelection = chat?.setSelection;
  const { start, end } = range;
  useEffect(() => {
    setSelection?.({ path, start, end });
    return () => setSelection?.(null);
  }, [setSelection, path, start, end]);
  if (!chat) {
    return null;
  }
  return {
    agent: chat.agent,
    ask: chat.agent
      ? async (body: string) => {
          await chat.send(body, chat.context);
          chat.setOpen(true);
        }
      : null,
  };
}
