import { describe, expect, it } from "vitest";
import { Group, Mesh, MeshBasicMaterial, BoxGeometry } from "three";
import type { Hotspot } from "../src/shared/types";
import { resolveHotspotFromIntersections } from "../src/renderer/src/hotspots";

describe("resolveHotspotFromIntersections", () => {
  it("matches direct hit node name", () => {
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    mesh.name = "Trout";

    const hotspot: Hotspot = {
      id: "h1",
      nodeName: "Trout",
      onClick: { type: "setAnimation", clip: "ghost_glitch" }
    };

    const result = resolveHotspotFromIntersections(
      [{ object: mesh } as never],
      new Map([["Trout", hotspot]])
    );

    expect(result?.id).toBe("h1");
  });

  it("walks parent chain when child mesh is hit", () => {
    const group = new Group();
    group.name = "RuinsSwitch";
    const child = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    child.name = "DetailPiece";
    group.add(child);

    const hotspot: Hotspot = {
      id: "h2",
      nodeName: "RuinsSwitch",
      onClick: { type: "goToCard", cardId: "ruins" }
    };

    const result = resolveHotspotFromIntersections(
      [{ object: child } as never],
      new Map([["RuinsSwitch", hotspot]])
    );

    expect(result?.id).toBe("h2");
  });
});
