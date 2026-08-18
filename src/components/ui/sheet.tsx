"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

export function SheetContent({ className, children, side = "bottom", ...props }: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: "top" | "right" | "bottom" | "left" }) {
  return <SheetPrimitive.Portal>
    <SheetPrimitive.Overlay className="ui-sheet-overlay" />
    <SheetPrimitive.Content data-side={side} className={cn("ui-sheet-content", className)} {...props}>
      {children}
      <SheetPrimitive.Close className="ui-sheet-close" aria-label="Закрыть"><X size={18} /></SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPrimitive.Portal>;
}

export function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("ui-sheet-header", className)} {...props} />;
}

export function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className={cn("ui-sheet-title", className)} {...props} />;
}

export function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description className={cn("ui-sheet-description", className)} {...props} />;
}

export function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("ui-sheet-footer", className)} {...props} />;
}
