import { FlaskConical } from "lucide-react";
import { Chip } from "@/components/ui/Chip";

/** Marks a demo profile or its idea: not a real person, and nothing is emailed. */
export function DemoChip() {
  return (
    <span title="A demo profile for testing. Not a real person; nothing is emailed.">
      <Chip>
        <FlaskConical aria-hidden="true" className="size-3" />
        Demo
      </Chip>
    </span>
  );
}
