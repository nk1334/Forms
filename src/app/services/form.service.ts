import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
  where,
} from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { Branch, ALL_CONCRETE_BRANCHES } from 'src/app/permissions.model';
import { collectionData } from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';

/** What your component lists on the dashboard */
export interface SavedForm {
  formId: string;
  formName?: string;
  formPages: any[];
  source?: 'template' | 'filled';
  pdfUrl?: string | null;
  firebaseId?: string;
  allowedBranches?: Branch[];
}

/** Payload for saving a filled form instance with full page snapshot */
export interface FilledFormPayload {
  sourceFormId: string;     // original template id (if any)
  formName: string;         // human-friendly name shown in the dashboard
  name: string;             // user-entered instance name (alias if you want)
  data: any;                // flat values map (optional convenience)
  formPagesSnapshot: any[]; // FULL layout (pages + fields + values)
  preview?: string | null;  // base64 image preview (optional)
}

/** Collection names (centralize here if you ever rename) */
const TEMPLATES = 'formTemplates';
const FILLED    = 'formFilled';
const LEGACY    = 'formSubmissions'; // optional/legacy
const BRANCHES_COLL = 'branches';

@Injectable({ providedIn: 'root' })
export class FormService {

  
  constructor(private afs: Firestore, private storage: Storage) {}

  // ======================== STORAGE HELPERS ==========================
  private normBranch(b: any): Branch {
    const v = String(b || '').toUpperCase();
    return (v === 'NSW' || v === 'YAT' || v === 'MACKAY' || v === 'ALL') ? (v as Branch) : 'NSW';
  }
  private normBranches(brs?: Branch[]): Branch[] {
  const arr = Array.isArray(brs) && brs.length ? brs : ['ALL'];
  const uniq = new Set(arr.map(b => this.normBranch(b)));
  // If it includes 'ALL', make it exactly ['ALL'] for consistency
  return uniq.has('ALL') ? ['ALL'] : Array.from(uniq);
}

  async uploadPdfBlob(
    kind: 'filled' | 'template',
    id: string,
    blob: Blob,
    filename: string
  ): Promise<string> {
    const safe = (filename || 'form')
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const path = `${kind}/${id}/${Date.now()}_${safe || 'form'}.pdf`;
    const storageRef = ref(this.storage, path);

    await uploadBytes(storageRef, blob, {
      contentType: 'application/pdf',
      contentDisposition: `attachment; filename="${safe || 'form'}.pdf"`,
    });
    return await getDownloadURL(storageRef);
  }

  async uploadImageBlob(
    kind: 'filled' | 'template',
    docId: string,
    fieldId: string,
    blob: Blob
  ): Promise<string> {
    const safe = (fieldId || 'signature').toLowerCase().replace(/[^a-z0-9-_]+/g, '-');
    const path = `${kind}/${docId}/signatures/${safe}.png`;
    const storageRef = ref(this.storage, path);
    await uploadBytes(storageRef, blob, {
      contentType: 'image/png',
      cacheControl: 'public,max-age=31536000',
    });
    return await getDownloadURL(storageRef);
  }

  async fetchPdfBlob(form: { pdfUrl?: string | null }): Promise<Blob | null> {
    try {
      if (!form?.pdfUrl) return null;
      const res = await fetch(form.pdfUrl, { mode: 'cors' });
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  }

  async attachPdfUrl(
    kind: 'filled' | 'template',
    id: string,
    pdfUrl: string
  ): Promise<void> {
    const coll = kind === 'filled' ? FILLED : TEMPLATES;
    const docRef = doc(this.afs, coll, id);
    await updateDoc(docRef, {
      pdfUrl,
      pdfUpdatedAt: serverTimestamp(),
    });
  }

  async attachPdfUrlToBranchTemplate(
    branchId: Branch,
    templateId: string,
    pdfUrl: string
  ): Promise<void> {
    const docRef = doc(this.afs, `${BRANCHES_COLL}/${branchId}/templates/${templateId}`);
    await updateDoc(docRef, {
      pdfUrl,
      pdfUpdatedAt: serverTimestamp(),
    });
  }
    async updateTemplateBranches(templateId: string, allowedBranches: Branch[]) {
  const ref = doc(this.afs, TEMPLATES, templateId);
  await updateDoc(ref, {
    allowedBranches: (allowedBranches?.length ? allowedBranches : ['ALL']),
    updatedAt: serverTimestamp(),
  });
}

  async attachPdfUrlToBranchTemplates(
    templateId: string,
    pdfUrl: string,
    branches: Branch[] = ALL_CONCRETE_BRANCHES
  ): Promise<void> {
    const writes = branches.map(async (b) => {
      const ref = doc(this.afs, `${BRANCHES_COLL}/${b}/templates/${templateId}`);
      await updateDoc(ref, {
        pdfUrl,
        pdfUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    await Promise.all(writes);
  }

  // ========================= TEMPLATES ===============================

  /** Create a template (layout only) in the master collection */
async saveFormTemplate(formName: string, formPages: any[], allowedBranches: Branch[] = ['ALL']) {
  const colRef = collection(this.afs, TEMPLATES);
  // ensure plain JSON
  const pages = JSON.parse(JSON.stringify(formPages || []));
  return addDoc(colRef, {
    formName,
    formPages: pages,
    allowedBranches: this.normBranches(allowedBranches),
    source: 'template',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

  /** Create master + fan-out copies into branches in a single operation */
async saveFormTemplateToBranches(formName: string, formPages: any[], branches: Branch[] = ALL_CONCRETE_BRANCHES, allowedBranches: Branch[] = ['ALL']) {
  const baseRef = collection(this.afs, TEMPLATES);
  const pages = JSON.parse(JSON.stringify(formPages || []));
  const normAllowed = this.normBranches(allowedBranches);
  const created = await addDoc(baseRef, {
    formName,
    formPages: pages,
    allowedBranches: normAllowed,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const templateId = created.id;

  const batch = writeBatch(this.afs);
  for (const branchId of branches.map(b => this.normBranch(b))) {
    const branchDocRef = doc(this.afs, `${BRANCHES_COLL}/${branchId}/templates/${templateId}`);
    batch.set(branchDocRef, {
      formId: templateId,
      formName,
      formPages: pages,
      branchId,
      allowedBranches: normAllowed,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return templateId;
}
  /** Update master template fields (and updatedAt) */
async updateFormTemplate(templateId: string, data: { formName?: string; formPages?: any[]; allowedBranches?: Branch[] }) {
  const ref = doc(this.afs, TEMPLATES, templateId);
  const payload: any = { updatedAt: serverTimestamp() };
  if (data.formName !== undefined) payload.formName = data.formName;
  if (data.formPages !== undefined) payload.formPages = JSON.parse(JSON.stringify(data.formPages));
  if (data.allowedBranches !== undefined) payload.allowedBranches = this.normBranches(data.allowedBranches);
  await updateDoc(ref, payload);
}

  /** Update branch copies to stay in sync with master */

async updateTemplateInBranches(templateId: string, data: { formName?: string; formPages?: any[]; allowedBranches?: Branch[] }, branches: Branch[] = ALL_CONCRETE_BRANCHES) {
  const batch = writeBatch(this.afs);
  const normAllowed = data.allowedBranches ? this.normBranches(data.allowedBranches) : undefined;
  const pages = data.formPages ? JSON.parse(JSON.stringify(data.formPages)) : undefined;

  for (const b of branches.map(x => this.normBranch(x))) {
    const ref = doc(this.afs, `${BRANCHES_COLL}/${b}/templates/${templateId}`);
    batch.set(ref, {
      ...(data.formName !== undefined ? { formName: data.formName } : {}),
      ...(pages !== undefined ? { formPages: pages } : {}),
      ...(normAllowed !== undefined ? { allowedBranches: normAllowed } : {}),
      branchId: b,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();
}

  /** Delete master template only (keep if some callers still rely on it) */
  async deleteFormTemplate(id: string): Promise<void> {
    const refDoc = doc(this.afs, TEMPLATES, id);
    await deleteDoc(refDoc);
  }

  /** Delete master + all branch copies */
  async deleteTemplateEverywhere(
    templateId: string,
    branches: Branch[] = ALL_CONCRETE_BRANCHES
  ): Promise<void> {
    // 1) delete master
    await this.deleteTemplate(templateId);

    // 2) delete branch copies
    const batch = writeBatch(this.afs);
    for (const b of branches) {
      const ref = doc(this.afs, `${BRANCHES_COLL}/${b}/templates/${templateId}`);
      batch.delete(ref);
    }
    await batch.commit();
  }

  /** Internal helper to delete from master */
  private async deleteTemplate(templateId: string) {
    const ref = doc(this.afs, TEMPLATES, templateId);
    await deleteDoc(ref);
  }

  /** Get a single template by id (normalized) */
  async getTemplateById(templateId: string): Promise<SavedForm | null> {
    const ref = doc(this.afs, TEMPLATES, templateId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data: any = snap.data();
    return {
      formId: snap.id,
      formName: data.formName ?? data.templateName ?? '(Untitled)',
      formPages: data.formPages ?? (data.fields ? [{ fields: data.fields }] : []),
      pdfUrl: data.pdfUrl ?? null,
      source: 'template',
      allowedBranches:
        Array.isArray(data.allowedBranches) && data.allowedBranches.length
          ? data.allowedBranches
          : ['ALL'],
    };
  }
getFormTemplates$(): Observable<SavedForm[]> {
  const colRef = collection(this.afs, TEMPLATES);
  const qv = query(colRef, orderBy('createdAt', 'desc'));
  return collectionData(qv, { idField: 'id' }).pipe(
    map((rows: any[]) => rows.map(d => ({
      formId: d.id ?? d.formId,
      firebaseId: d.id ?? d.formId,
      formName: d.formName ?? d.templateName ?? '(Untitled)',
      formPages: d.formPages ?? (d.fields ? [{ fields: d.fields }] : []),
      pdfUrl: d.pdfUrl ?? null,
      source: 'template',
      allowedBranches: Array.isArray(d.allowedBranches) && d.allowedBranches.length ? d.allowedBranches : ['ALL'],
    })))
  );
}
getVisibleTemplatesForBranch$(branch: Branch): Observable<SavedForm[]> {
  if (branch === 'ALL') return this.getFormTemplates$();

  const colRef = collection(this.afs, TEMPLATES);
  const qv = query(
    colRef,
    where('allowedBranches', 'array-contains-any', ['ALL', branch]),
    orderBy('createdAt', 'desc')
  );
  return collectionData(qv, { idField: 'id' }).pipe(
    map((rows: any[]) => rows.map(d => ({
      formId: d.id ?? d.formId,
      firebaseId: d.id ?? d.formId,
      formName: d.formName ?? '(Untitled)',
      formPages: d.formPages ?? [],
      pdfUrl: d.pdfUrl ?? null,
      source: 'template',
      allowedBranches: Array.isArray(d.allowedBranches) && d.allowedBranches.length ? d.allowedBranches : ['ALL'],
    } as SavedForm)))
  );
}
private deserializeFromFirestorePages(raw: any[]): any[] {
  const pages = JSON.parse(JSON.stringify(raw || []));
  for (const page of pages) {
    const fields = Array.isArray(page?.fields) ? page.fields : [];
    for (const f of fields) {
      const gm = f?.gridMatrix;
      if (gm && Array.isArray(gm.cellsFlat) && Number.isInteger(gm.colCount) && gm.colCount > 0) {
        const cols = gm.colCount as number;
        const rows: any[][] = [];
        for (let i = 0; i < gm.cellsFlat.length; i += cols) {
          rows.push(gm.cellsFlat.slice(i, i + cols));
        }
        gm.cells = rows;
        delete gm.cellsFlat;
        delete gm.colCount;
      }
    }
  }
  return pages;
}
  /** List templates (normalized) from master */
  async getFormTemplates(): Promise<SavedForm[]> {
    const colRef = collection(this.afs, TEMPLATES);
    const snap = await getDocs(query(colRef, orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => {
      const data: any = d.data();
      const formName = data.formName ?? data.templateName ?? '(Untitled)';
      const formPages =
        data.formPages ??
        (data.fields ? [{ fields: data.fields }] : []);
      return {
        formId: d.id,
        firebaseId: d.id,
        formName,
        formPages,
        pdfUrl: data.pdfUrl ?? null,
        source: 'template',
        allowedBranches:
          Array.isArray(data.allowedBranches) && data.allowedBranches.length
            ? data.allowedBranches
            : ['ALL'],
      };
    });
  }

  /** List templates under one branch subcollection */
  async getBranchTemplates(branchId: Branch): Promise<SavedForm[]> {
    const colRef = collection(this.afs, `${BRANCHES_COLL}/${branchId}/templates`);
    const snap = await getDocs(query(colRef, orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => {
      const data: any = d.data();
      return {
        formId: d.id,
        firebaseId: d.id,
        formName: data.formName ?? '(Untitled)',
        formPages: data.formPages ?? [],
        pdfUrl: data.pdfUrl ?? null,
        source: 'template',
        allowedBranches:
          Array.isArray(data.allowedBranches) && data.allowedBranches.length
            ? data.allowedBranches
            : ['ALL'],
      };
    });
  }
async getVisibleTemplatesForBranch(branch: Branch): Promise<SavedForm[]> {
  if (branch === 'ALL') return this.getFormTemplates();

  const colRef = collection(this.afs, TEMPLATES);
  const qv = query(
    colRef,
    where('allowedBranches', 'array-contains-any', ['ALL', branch])
    // no orderBy for the same reason
  );

  const snap = await getDocs(qv);
  const out = snap.docs.map((d) => {
    const data: any = d.data();
    return {
      formId: d.id,
      firebaseId: d.id,
      formName: data.formName ?? data.templateName ?? '(Untitled)',
      formPages:
        data.formPages
        ?? data.formPagesSnapshot
        ?? (data.fields ? [{ fields: data.fields }] : []),
      pdfUrl: data.pdfUrl ?? null,
      source: data.source ?? 'template',
      allowedBranches:
        Array.isArray(data.allowedBranches) && data.allowedBranches.length
          ? data.allowedBranches
          : ['ALL'],
      createdAt: data.createdAt ?? null,
    } as SavedForm;
  });

  // sort on client
  out.sort((a: any, b: any) =>
    (b as any).createdAt?.seconds - (a as any).createdAt?.seconds
    || (a.formName ?? '').localeCompare(b.formName ?? '')
  );

  return out;
}
  /** List master templates visible to a branch (ALL or that branch) */
  
  // ======================= FILLED FORMS ==============================

  /** Create a FILLED instance (layout + values) */
  async createFilledForm(payload: {
    sourceFormId?: string;
    formName: string;
    name?: string;
    data: any;
    formPagesSnapshot: any[];
    preview?: string | null;
    updatedAt?: number; // client clock
  }) {
    const colRef = collection(this.afs, FILLED);
    return addDoc(colRef, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  /** Update a FILLED instance’s name/pages/data/preview */
  async updateFilledForm(
    formId: string,
    data: Partial<{
      formName: string;
      name: string;
      data: any;
      formPagesSnapshot: any[];
      preview: string | null;
      updatedAt: number; // client clock
    }>
  ) {
    const ref = doc(this.afs, FILLED, formId);
    await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
  }

  /** Delete a FILLED instance */
  async deleteFilledForm(formId: string) {
    const ref = doc(this.afs, FILLED, formId);
    await deleteDoc(ref);
  }

  /** Get a single FILLED instance by id (normalized) */
  async getFilledFormById(formId: string): Promise<SavedForm | null> {
    const ref = doc(this.afs, FILLED, formId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data: any = snap.data();
     const pages = this.deserializeFromFirestorePages(data.formPagesSnapshot ?? []);
    return {
      formId: snap.id,
      formName: data.formName ?? data.name ?? '(Untitled)',
      formPages: data.formPagesSnapshot ?? [],
      pdfUrl: data.pdfUrl ?? null,
      source: 'filled',
    };
  }

  /** List FILLED instances (normalized) */
  async getFilledForms(): Promise<SavedForm[]> {
    const colRef = collection(this.afs, FILLED);
    const snap = await getDocs(query(colRef, orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => {
      const data: any = d.data();
      const pages = this.deserializeFromFirestorePages(data.formPagesSnapshot ?? []);
      return {
        formId: d.id, // instance id
        formName: data.formName ?? data.name ?? '(Untitled)',
        formPages: data.formPagesSnapshot ?? [],
        pdfUrl: data.pdfUrl ?? null,
        source: 'filled',
      };
    });
  }

  // ============== SIMPLE SUBMISSIONS (legacy/optional) ===============

  /** Legacy/basic submission: saves only a values object (no layout) */
  async saveFormSubmission(templateId: string, filledData: any) {
    const colRef = collection(this.afs, LEGACY);
    return addDoc(colRef, {
      templateId,
      filledData,
      submittedAt: serverTimestamp(),
    });
  }

  // ========================= UTILITIES ===============================

  /** Convenience: merge templates + filled */
  async getAllFormsMerged(): Promise<SavedForm[]> {
    const [templates, filled] = await Promise.all([
      this.getFormTemplates(),
      this.getFilledForms(),
    ]);
    const merged = [...templates, ...filled];

    merged.sort((a, b) =>
      (a.formName ?? '').localeCompare(b.formName ?? '', undefined, { sensitivity: 'base' })
    );

    return merged;
  }
}