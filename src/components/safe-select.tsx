import { Component, useState, type ReactNode, type ErrorInfo } from "react";
import { logger } from "@/lib/logger";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SafeSelectOption = { value: string; label: string; disabled?: boolean };

type Props = {
  value: string;
  onValueChange: (v: string) => void;
  options: SafeSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  triggerClassName?: string;
  ariaLabel?: string;
  /** Optional custom Radix content (e.g. empty-state text). If omitted, we render options as SelectItem. */
  renderContent?: () => ReactNode;
};

class Boundary extends Component<
  { children: ReactNode; onError: (e: Error) => void; fallback: ReactNode; failed: boolean },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError(error);
    logger
      .error(`SafeSelect crash: ${error.message}`, {
        context: "ui/safe-select",
        details: { stack: error.stack, componentStack: info.componentStack },
        silent: true,
      })
      .catch(() => {});
  }
  render() {
    if (this.state.error || this.props.failed) return <>{this.props.fallback}</>;
    return <>{this.props.children}</>;
  }
}

/**
 * Renders a Radix Select but if it crashes (e.g. removeChild during Dialog unmount),
 * falls back to a plain native <select> so the surrounding form remains usable
 * and the sale can still be saved.
 */
export function SafeSelect({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  triggerClassName,
  ariaLabel,
  renderContent,
}: Props) {
  const [failed, setFailed] = useState(false);
  const fallback = (
    <select
      aria-label={ariaLabel}
      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );

  return (
    <Boundary failed={failed} fallback={fallback} onError={() => setFailed(true)}>
      <Select value={value || ""} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger className={triggerClassName} aria-label={ariaLabel}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {renderContent
            ? renderContent()
            : options.map((o) => (
                <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
                  {o.label}
                </SelectItem>
              ))}
        </SelectContent>
      </Select>
    </Boundary>
  );
}
