import { useEffect, useRef } from "react";

export function useEscapeToClose(
  active: boolean,
  onClose: () => void,
  triggerRef?: React.RefObject<HTMLElement>
) {
  const onCloseRef = useRef(onClose);
  const triggerRefRef = useRef(triggerRef);
  useEffect(() => {
    onCloseRef.current = onClose;
    triggerRefRef.current = triggerRef;
  });

  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        triggerRefRef.current?.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active]);
}
