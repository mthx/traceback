import { useState } from "react";
import { EventsList } from "@/components/events-list";

export function Log() {
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(false);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-4">
        <h1 className="text-2xl font-semibold">Log</h1>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showUnassignedOnly}
            onChange={(e) => setShowUnassignedOnly(e.target.checked)}
            className="rounded"
          />
          <span>Unassigned only</span>
        </label>
      </div>

      <div className="flex-1 min-h-0">
        <EventsList showUnassignedOnly={showUnassignedOnly} />
      </div>
    </div>
  );
}
