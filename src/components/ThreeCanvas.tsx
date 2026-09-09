import { useEffect, useRef } from "react";
import type { Cabinet, PanelItem, Settings } from "../types";
import { CabinetViewer, type ViewStyle } from "../three/scene";
import { useDebounced } from "../lib/useDebounced";
import * as THREE from "three";

export function ThreeCanvas({
  cabinets,
  settings,
  spacing = 0,
  showDims = true,
  doorsOpen = false,
  drawersOpen = false,
  followLayout = false,
  panels = [],
  viewStyle = "realistic",
  showEdges = false,
  showLabels = false,
  onReady,
  onCabinetClick,
  className,
}: {
  cabinets: Cabinet[];
  settings: Settings;
  spacing?: number;
  showDims?: boolean;
  doorsOpen?: boolean;
  drawersOpen?: boolean;
  followLayout?: boolean;
  panels?: PanelItem[];
  /** realistic = textured render · technical = panel outlines · blueprint = x-ray */
  viewStyle?: ViewStyle;
  /** outline every panel (crisp CAD-style edges) */
  showEdges?: boolean;
  /** name + size tag floating above every cabinet */
  showLabels?: boolean;
  onReady?: (v: CabinetViewer) => void;
  onCabinetClick?: (cab: Cabinet | null) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<CabinetViewer | null>(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const clickRef = useRef(onCabinetClick);
  clickRef.current = onCabinetClick;

  useEffect(() => {
    if (!ref.current) return;
    const v = new CabinetViewer(ref.current);
    viewerRef.current = v;
    readyRef.current?.(v);
    return () => {
      v.dispose();
      viewerRef.current = null;
    };
  }, []);

  // raycasting: detect which cabinet was clicked
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const onClick = (e: React.MouseEvent) => {
    const viewer = viewerRef.current;
    if (!viewer || !clickRef.current || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.current.setFromCamera(mouse.current, viewer.camera as THREE.Camera);
    const hits = raycaster.current.intersectObjects(viewer.scene.children, true);
    let found: Cabinet | null = null;
    for (const h of hits) {
      let obj: THREE.Object3D | null = h.object;
      while (obj) {
        if (obj.userData?.cabId && obj.userData?.cab) { found = obj.userData.cab as Cabinet; break; }
        obj = obj.parent;
      }
      if (found) break;
    }
    clickRef.current(found);
  };

  // rebuilding the scene is expensive — wait for typing/dragging to settle
  const dCabinets = useDebounced(cabinets, 200);
  const dSettings = useDebounced(settings, 200);
  const dSpacing = useDebounced(spacing, 200);
  const dFollow = useDebounced(followLayout, 200);
  const dPanels = useDebounced(panels, 200);

  useEffect(() => {
    viewerRef.current?.setData(dCabinets, dSettings, { spacing: dSpacing, showDims, followLayout: dFollow, panels: dPanels });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dCabinets, dSettings, dSpacing, dFollow, dPanels]);

  useEffect(() => {
    viewerRef.current?.setShowDims(showDims);
  }, [showDims]);

  useEffect(() => {
    viewerRef.current?.setStyle(viewStyle);
  }, [viewStyle]);

  useEffect(() => {
    viewerRef.current?.setEdges(showEdges);
  }, [showEdges]);

  useEffect(() => {
    viewerRef.current?.setCabinetTags(showLabels);
  }, [showLabels]);

  useEffect(() => {
    if (viewerRef.current) viewerRef.current.doorsOpen = doorsOpen;
  }, [doorsOpen]);

  useEffect(() => {
    if (viewerRef.current) viewerRef.current.drawersOpen = drawersOpen;
  }, [drawersOpen]);

  return (
    <div ref={ref} className={className} style={{ cursor: onCabinetClick ? "pointer" : "default" }} onClick={onCabinetClick ? onClick : undefined} />
  );
}

export function getViewer(ref: React.RefObject<CabinetViewer | null>) {
  return ref.current;
}
