import { api } from '../services/api';

export async function exportOPML() {
  return api.exportOPML();
}

export async function importOPML(file: File) {
  return api.importOPML(file);
}
