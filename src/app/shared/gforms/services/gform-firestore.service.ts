import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class GformFirestoreService {
serializeForFirestorePages(pages: any[]): any[] {
    const clone: any[] = JSON.parse(JSON.stringify(pages));
    for (const p of clone) {
      for (const f of p.fields || []) {
        const gm = f.gridMatrix;
        if (gm?.cells && Array.isArray(gm.cells) && Array.isArray(gm.cells[0])) {
          const flat: Array<{ r:number; c:number; cell:any }> = [];
          gm.cells.forEach((row: any[], r: number) =>
            row.forEach((cell: any, c: number) => flat.push({ r, c, cell }))
          );
          gm.cellsFlat = flat;
          delete gm.cells;
        }
      }
    }
    return clone;
  }
normalizeGridForSave(pages: Array<{ fields: any[] }>) {
  pages.forEach(p =>
    (p.fields || []).forEach((f: any) => {
      const t = String(f.type || '').toLowerCase().replace(/\s|_/g,'-');
      if (t === 'data-grid' || t === 'datagrid' || t === 'grid' || t === 'matrix') {
        f.type = 'data-grid';
        const gm = (f.gridMatrix ||= { rows: 1, cols: 1, cells: [[{ items: [] }]] });
        gm.cellH ??= 140; gm.gap ??= 12; gm.showBorders ??= true;
        gm.rows = Math.max(1, gm.rows || gm.cells?.length || 1);
        gm.cols = Math.max(1, gm.cols || gm.cells?.[0]?.length || 1);
        gm.cells = Array.from({ length: gm.rows }, (_r, r) =>
          Array.from({ length: gm.cols }, (_c, c) => {
            const cell = gm.cells?.[r]?.[c] || { items: [] };
            cell.items = (cell.items || []).map((it: any) => ({
              ...it,
              value: it.value ?? (it.type === 'checkbox' ? [] : null),
              options: Array.isArray(it.options)
                ? it.options.map((o: any) => ({
                    label: o.label ?? String(o.value ?? ''),
                    value: o.value ?? o.label ?? ''
                  }))
                : undefined
            }));
            return cell;
          })
        );
      }
    })
  );
}
  deserializeFromFirestorePages(pages: any[]): any[] {
    for (const p of pages) {
      for (const f of p.fields || []) {
        const gm = f.gridMatrix;
        if (gm?.cellsFlat && Number.isInteger(gm.rows) && Number.isInteger(gm.cols)) {
          const cells = Array.from({ length: gm.rows }, () =>
            Array.from({ length: gm.cols }, () => ({ items: [] }))
          );
          for (const { r, c, cell } of gm.cellsFlat) {
            if (cells[r] && cells[r][c]) cells[r][c] = cell;
          }
          gm.cells = cells;
          delete gm.cellsFlat;
        }
      }
    }
    return pages;
  }
}
