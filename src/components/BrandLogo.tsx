import clsx from "clsx";

/**
 * Navodaya Vidyalaya Samiti emblem. Its lettering is navy on a transparent background,
 * so it always sits on a white badge (readable on the dark header and on photos).
 */
export default function BrandLogo({ size = "md", className }: { size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const box = { sm: "h-10 w-10 p-1", md: "h-12 w-12 p-1", lg: "h-20 w-20 p-1.5", xl: "h-28 w-28 p-2" }[size];
  return (
    <span className={clsx("inline-flex shrink-0 items-center justify-center rounded-full bg-white shadow-md ring-2 ring-gold-400/70", box, className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/nvs-logo-sm.png" alt="Navodaya Vidyalaya Samiti emblem" className="h-full w-full object-contain" width={131} height={176} />
    </span>
  );
}

/** Saffron - white - green strip (colours of the emblem / national flag). */
export function TricolourBar({ className }: { className?: string }) {
  return (
    <div className={clsx("flex h-1.5 w-full", className)} aria-hidden="true">
      <span className="flex-1 bg-gold-500" />
      <span className="flex-1 bg-white" />
      <span className="flex-1 bg-leaf-600" />
    </div>
  );
}
