import type { Intersection, Object3D } from "three";
import type { Hotspot } from "@shared/types";

export function resolveHotspotFromIntersections(
  intersections: Array<Intersection<Object3D>>,
  hotspotsByNodeName: Map<string, Hotspot>
): Hotspot | null {
  for (const intersection of intersections) {
    let node: Object3D | null = intersection.object;
    while (node) {
      const hotspot = hotspotsByNodeName.get(node.name);
      if (hotspot) {
        return hotspot;
      }
      node = node.parent;
    }
  }
  return null;
}
