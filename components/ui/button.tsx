import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-indigo-500 text-white hover:bg-indigo-400 active:bg-indigo-600 shadow-sm",
        ghost:
          "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 active:bg-zinc-700",
        outline:
          "border border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600 hover:text-zinc-100",
        secondary:
          "bg-zinc-800 text-zinc-200 hover:bg-zinc-700 active:bg-zinc-600",
        destructive:
          "bg-rose-600 text-white hover:bg-rose-500",
        link: "text-indigo-400 underline-offset-4 hover:underline hover:text-indigo-300 p-0 h-auto",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-7 rounded-md px-3 text-xs",
        lg: "h-11 px-6 text-base",
        icon: "h-8 w-8 rounded-md",
        "icon-sm": "h-7 w-7 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
