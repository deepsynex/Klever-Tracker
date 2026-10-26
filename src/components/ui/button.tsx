import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-ctl border border-transparent font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary: "border-border-strong bg-surface text-foreground hover:bg-surface-2",
        ghost: "bg-transparent text-muted-foreground hover:bg-surface-2 hover:text-foreground",
        destructive: "bg-destructive text-white hover:opacity-90",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5 text-sm",
        sm: "h-8 px-2.5 text-[13px]",
        lg: "h-10 px-5 text-sm",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, type = "button", ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...(asChild ? {} : { type })}
      {...props}
    />
  );
}

export { buttonVariants };
