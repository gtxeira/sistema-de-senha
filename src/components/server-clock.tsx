"use client";

import { Clock3 } from "lucide-react";
import { useServerClock } from "@/hooks/use-server-clock";

export function ServerClock() {
  const { timeString } = useServerClock();

  return (
    <div className="flex items-center gap-1.25">
      <Clock3 size={16} /> {timeString || "--:--:--"}
    </div>
  );
}