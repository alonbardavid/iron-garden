import { Box, Text } from "@mantine/core";
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { palette } from "@lib/ds";
import { GhostButton } from "./diff/controls";

// Past this height a description is cut short, with a button to read on.
const CLAMP_HEIGHT = 280;
// A description only this much taller is shown whole.
const CLAMP_SLACK = 60;

export const Clamped = ({ children }: { children: ReactNode }) => {
  const content = useRef<HTMLDivElement>(null);
  const [tall, setTall] = useState(false);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const element = content.current;
    if (!element) {
      return;
    }
    const measure = () =>
      setTall(element.scrollHeight > CLAMP_HEIGHT + CLAMP_SLACK);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const clamped = tall && !open;
  const fade: CSSProperties = {
    position: "absolute",
    inset: "auto 0 0 0",
    height: 64,
    background: `linear-gradient(transparent, ${palette.surface})`,
    pointerEvents: "none",
  };
  return (
    <div>
      <Box
        pos="relative"
        style={clamped ? { maxHeight: CLAMP_HEIGHT, overflow: "hidden" } : {}}
      >
        <Text ref={content} component="div" fz={13.5} c={palette.ink}>
          {children}
        </Text>
        {clamped && <div aria-hidden style={fade} />}
      </Box>
      {tall && (
        <Box mt={4} ml={-6}>
          <GhostButton onClick={() => setOpen(!open)}>
            {open ? "Show less" : "Show more"}
          </GhostButton>
        </Box>
      )}
    </div>
  );
};
