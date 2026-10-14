import { useEffect, useState } from "react";
import { MAX_CHAT_SELECTED_TEXT } from "@lib/contract";

// Marks the chat's own elements, whose selections are not the page's.
export const CHAT_ROOT_ATTRIBUTE = "data-chat";

// The text last selected on the page, outside the chat. Clicking into the
// chat clears the page's selection, so it is remembered until the person
// selects something else, clicks elsewhere on the page, or it is sent. Used
// by the open chat only, so a drag-select on the page re-renders nothing
// else; the selection made before opening it counts.
export function useSelectedText() {
  const [selectedText, setSelectedText] = useState(pageSelection);
  useEffect(() => {
    const remember = () => {
      const text = pageSelection();
      if (text !== undefined) {
        setSelectedText(text);
      }
    };
    document.addEventListener("selectionchange", remember);
    return () => document.removeEventListener("selectionchange", remember);
  }, []);
  return {
    selectedText: selectedText ?? null,
    clearSelectedText: () => setSelectedText(null),
  };
}

// The page's selected text, null for none, or undefined for a selection
// inside the chat, which leaves the remembered one alone.
function pageSelection(): string | null | undefined {
  const selection = document.getSelection();
  if (insideChat(selection?.anchorNode ?? null)) {
    return undefined;
  }
  const text = selection?.toString().trim() ?? "";
  return text ? text.slice(0, MAX_CHAT_SELECTED_TEXT) : null;
}

function insideChat(node: Node | null): boolean {
  const element = node instanceof Element ? node : node?.parentElement;
  return !!element?.closest(`[${CHAT_ROOT_ATTRIBUTE}]`);
}
