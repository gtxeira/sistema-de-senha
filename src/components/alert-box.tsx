import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { cn } from "cn";

/**
 * Mensagem inline de feedback — padrão do Admin (`.alertBox`).
 * Composição sobre o `Alert` do shadcn (role="alert" incluído).
 */
const alertBoxTones = {
  success: "border-success/30 bg-success/10 text-success",
  info: "border-border bg-card text-foreground",
} as const;

type AlertBoxTone = keyof typeof alertBoxTones;

interface AlertBoxProps extends React.ComponentProps<typeof Alert> {
  tone?: AlertBoxTone;
}

function AlertBox({ className, tone = "success", children, ...props }: AlertBoxProps) {
  return (
    <Alert
      className={cn(
        "mb-1.5 rounded-[8px] px-[18px] py-[13px] text-[13px]",
        alertBoxTones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </Alert>
  );
}

export { AlertBox };
