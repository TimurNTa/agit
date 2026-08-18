import * as React from "react";
import { cn } from "@/lib/utils";

export function Progress({ value = 0, className, ...props }: React.ComponentProps<"div"> & { value?: number }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return <div data-slot="progress" className={cn("ui-progress", className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={safeValue} {...props}><div className="ui-progress-indicator" style={{ transform: `translateX(-${100 - safeValue}%)` }} /></div>;
}
