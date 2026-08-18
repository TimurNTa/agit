import * as React from "react";
import { cn } from "@/lib/utils";

export function TabsList({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="tabs-list" role="tablist" className={cn("ui-tabs-list", className)} {...props} />;
}

export function TabsTrigger({ active, className, ...props }: React.ComponentProps<"button"> & { active?: boolean }) {
  return <button data-slot="tabs-trigger" role="tab" aria-selected={active} data-state={active ? "active" : "inactive"} className={cn("ui-tabs-trigger", className)} {...props} />;
}
