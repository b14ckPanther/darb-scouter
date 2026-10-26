import { addCollection, Icon as Iconify } from "@iconify/react/offline";
import solar from "@iconify-json/solar/icons.json";

// Solar icons, bundled offline: no network fetch, one consistent modern set across the app.
addCollection(solar);

export type IconName =
  | "alt-arrow-up-bold"
  | "alt-arrow-down-bold"
  | "minus-circle-bold"
  | "record-circle-bold"
  | "star-bold"
  | "link-round-bold";

/** Decorative unless `label` is given; then it is announced as an image with that name. */
export function Icon({
  name,
  label,
  className,
  size = "1em",
}: {
  name: IconName;
  label?: string;
  className?: string;
  size?: string;
}) {
  return (
    <Iconify
      icon={`solar:${name}`}
      width={size}
      height={size}
      className={className}
      {...(label
        ? { role: "img", "aria-label": label }
        : { "aria-hidden": true })}
    />
  );
}
