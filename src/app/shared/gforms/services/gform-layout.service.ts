import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class GformLayoutService {
  captureCurrentLayoutForSave(pages: Array<{ fields: any[] }>) {
    for (const p of (pages || [])) {
      for (const f of (p.fields || [])) {
        f.position ||= { x: 0, y: 0 };
        f.position.x = Math.max(0, Math.round(f.position.x ?? 0));
        f.position.y = Math.max(0, Math.round(f.position.y ?? 0));
        f.width  = Math.max(20, Math.round((f.width  ?? 300) as number));
        f.height = Math.max(20, Math.round((f.height ?? 44)  as number));
      }
    }
  }

  anchorPageToTopLeft(
    page: { fields?: Array<{ position?: { x?: number; y?: number } }> },
    pad: number = 12
  ): void {
    const fs = page?.fields || [];
    if (!fs.length) return;

    const minX = Math.min(...fs.map(f => Math.max(0, Math.round(f.position?.x ?? 0))));
    const minY = Math.min(...fs.map(f => Math.max(0, Math.round(f.position?.y ?? 0))));

    const shiftX = Math.max(0, minX - pad);
    const shiftY = Math.max(0, minY - pad);

    if (shiftX || shiftY) {
      fs.forEach(f => {
        f.position ||= { x: 0, y: 0 };
        f.position.x = Math.max(0, Math.round((f.position.x ?? 0) - shiftX));
        f.position.y = Math.max(0, Math.round((f.position.y ?? 0) - shiftY));
      });
    }
  }
}