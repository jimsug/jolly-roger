import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faFolderOpen } from "@fortawesome/free-regular-svg-icons/faFolderOpen";
import { faMapPin } from "@fortawesome/free-solid-svg-icons/faMapPin";
import { faStar } from "@fortawesome/free-solid-svg-icons/faStar";
import type { TagKind } from "../../lib/tagNames";

// The kinds of tag whose prefix a chip draws as an icon, as the puzzle
// list's legend explains them.
export const TAG_KIND_ICONS = {
  group: faFolderOpen,
  metaFor: faStar,
  location: faMapPin,
} satisfies Partial<Record<TagKind, IconDefinition>>;

export function tagKindIcon(kind: TagKind): IconDefinition | undefined {
  const icons: Partial<Record<TagKind, IconDefinition>> = TAG_KIND_ICONS;
  return icons[kind];
}
