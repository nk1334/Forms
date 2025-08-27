import { Branch } from '../permissions.model';
export interface AppTemplate {
  id: string;          // unique id (e.g. from Firestore)
  name: string;        // template name
  // add any other fields you already use, like description, createdAt, etc.

  // NEW: where this template should appear
  allowedBranches: Branch[]; // e.g. ['ALL'] or ['MKAY','NSW']
}
