import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  title = "Binodex",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-7 shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role="img"
    >
      {title ? <title>{title}</title> : null}
      <rect width="32" height="32" rx="6" fill="#80f6bc" />
      <path
        d="M9 8h8.1c3.35 0 5.5 1.75 5.5 4.35 0 1.65-.95 2.95-2.55 3.55 1.85.6 3.05 2.05 3.05 4.05C23.1 22.85 20.7 25 16.6 25H9V8Zm3.25 2.55v4.15h4.55c1.55 0 2.55-.75 2.55-2.05s-1-2.1-2.55-2.1h-4.55Zm0 6.35V22.4h5.15c1.75 0 2.85-.85 2.85-2.25s-1.1-2.25-2.85-2.25h-5.15Z"
        fill="#0b0e11"
      />
    </svg>
  );
}

export function BrandLockup({
  className,
  wordmark = "BINODEX",
  caption,
}: {
  className?: string;
  wordmark?: string;
  caption?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <BrandMark className="size-8" />
      <span className="min-w-0 leading-none">
        <span className="block text-[15px] font-semibold tracking-[-0.03em]">
          {wordmark}
        </span>
        {caption ? (
          <span className="text-muted-foreground mt-0.5 block text-[11px]">
            {caption}
          </span>
        ) : null}
      </span>
    </span>
  );
}
