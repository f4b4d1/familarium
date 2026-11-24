// Verschieben (Ziehen) und Zoomen (Mausrad, Knöpfe) für eine SVG-Fläche, ohne Bibliothek.

import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';

export interface View {
  x: number;
  y: number;
  k: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const MIN_K = 0.08;
const MAX_K = 2.5;
const clamp = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

export function usePanZoom(svgRef: RefObject<SVGSVGElement | null>, bounds: Bounds) {
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const drag = useRef<{ x: number; y: number; view: View } | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, [svgRef]);

  const zoomAt = useCallback((factor: number, px: number, py: number) => {
    setView((v) => {
      const k = clamp(v.k * factor);
      return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
    });
  }, []);

  // Mausrad braucht einen nicht-passiven Listener, damit die Seite nicht mitscrollt.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [svgRef, zoomAt]);

  const fit = useCallback(() => {
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    const k = clamp(Math.min(size.width / w, size.height / h) * 0.95);
    setView({ k, x: (size.width - w * k) / 2 - bounds.minX * k, y: (size.height - h * k) / 2 - bounds.minY * k });
  }, [bounds, size]);

  const centerOn = useCallback(
    (cx: number, cy: number, k?: number) => {
      setView((v) => {
        const nk = clamp(k ?? Math.max(v.k, 0.9));
        return { k: nk, x: size.width / 2 - cx * nk, y: size.height / 2 - cy * nk };
      });
    },
    [size],
  );

  /** Zeigt einen Punkt oben mittig an, z. B. den Stammvater zum Start. */
  const showTop = useCallback(
    (cx: number, top: number, k: number) => setView({ k, x: size.width / 2 - cx * k, y: 24 - top * k }),
    [size],
  );

  const handlers = {
    onPointerDown: (event: PointerEvent<SVGSVGElement>) => {
      if (event.button !== 0) return;
      drag.current = { x: event.clientX, y: event.clientY, view };
    },
    onPointerMove: (event: PointerEvent<SVGSVGElement>) => {
      const start = drag.current;
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) event.currentTarget.setPointerCapture(event.pointerId);
      setView({ ...start.view, x: start.view.x + dx, y: start.view.y + dy });
    },
    onPointerUp: () => {
      drag.current = null;
    },
  };

  return { view, size, ready: size.width > 0, handlers, fit, centerOn, showTop, zoomAt };
}
