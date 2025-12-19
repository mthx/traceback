import { useEffect, RefObject } from "react";
import { HOUR_HEIGHT } from "@/components/calendar-utils";

export function useScrollToHour(
  scrollRef: RefObject<HTMLDivElement | null>,
  hour: number = 8
) {
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = hour * HOUR_HEIGHT;
    }
  }, [scrollRef, hour]);
}
