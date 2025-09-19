import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class GformGridService {
  syncGridPixelsFromWrapper(pages: Array<{ fields: any[] }>) {
    for (const p of (pages || [])) {
      for (const f of (p.fields || [])) {
        const t = String(f?.type || '').toLowerCase();
        if (!/^(data-?grid|grid|matrix|datagrid)$/.test(t)) continue;

        const gm = (f.gridMatrix ||= {});
        gm.gap   = Math.max(0, gm.gap ?? 12);
        gm.cols  = Math.max(1, gm.cols ?? (gm?.cells?.[0]?.length || 1));
        gm.rows  = Math.max(1, gm.rows ?? (gm?.cells?.length || 1));
        gm.cellW = this.gridCellWFromWrapper(f);
        gm.cellH = this.gridCellHFromWrapper(f);
      }
    }
  }

  gridCellWFromWrapper(field: any): number {
    const cols = Math.max(1, field.gridMatrix?.cols ?? 1);
    const gap = Math.max(0, field.gridMatrix?.gap ?? 12);
    return Math.floor(((field.width ?? 480) - gap * (cols + 1)) / cols);
  }

  gridCellHFromWrapper(field: any): number {
    return Math.max(
      60,
      Math.floor((field.height ?? 240) / (field.gridMatrix?.rows ?? 1)) - 12
    );
  }
}
