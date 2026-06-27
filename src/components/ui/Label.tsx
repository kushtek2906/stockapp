import * as RadixLabel from "@radix-ui/react-label";
import { cn } from "../../lib/utils";

type LabelProps = React.ComponentPropsWithoutRef<typeof RadixLabel.Root>;

function Label({ className, ...props }: LabelProps) {
  return (
    <RadixLabel.Root
      className={cn("text-sm font-medium text-slate-700", className)}
      {...props}
    />
  );
}

export { Label };
