import { useEffect, useRef } from "react";
import { TemplateForm, SectionForm, FieldForm, StepForm } from "@/modules/tarefas/types/tarefas_types";
import { CheckItemForm } from "./types";

const PREFIX = "tarefas_builder_draft_v1::";
const DEBOUNCE_MS = 800;

export interface BuilderDraftPayload {
  v: 1;
  savedAt: number;
  form: TemplateForm;
  sections: SectionForm[];
  fields: FieldForm[];
  steps: StepForm[];
  checkItems: CheckItemForm[];
}

export const draftKey = (templateId: string | null) =>
  `${PREFIX}${templateId ?? "__new__"}`;

export function loadDraft(templateId: string | null): BuilderDraftPayload | null {
  try {
    const raw = localStorage.getItem(draftKey(templateId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BuilderDraftPayload;
    if (parsed?.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft(templateId: string | null) {
  try {
    localStorage.removeItem(draftKey(templateId));
  } catch {
    /* ignore */
  }
}

export function saveDraft(templateId: string | null, payload: Omit<BuilderDraftPayload, "v" | "savedAt">) {
  try {
    const data: BuilderDraftPayload = { v: 1, savedAt: Date.now(), ...payload };
    localStorage.setItem(draftKey(templateId), JSON.stringify(data));
  } catch {
    /* ignore quota errors */
  }
}

/**
 * Debounced autosave to localStorage. Activates only while `enabled` is true.
 * Does NOT touch the database. Cleared explicitly via clearDraft on publish.
 */
export function useDraftAutosave(
  templateId: string | null,
  enabled: boolean,
  payload: Omit<BuilderDraftPayload, "v" | "savedAt">,
) {
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      // Skip empty new templates (avoid creating noise drafts)
      if (templateId === null && !payload.form.nome?.trim() && payload.fields.length === 0 && payload.checkItems.length === 0 && payload.sections.length === 0) {
        return;
      }
      saveDraft(templateId, payload);
    }, DEBOUNCE_MS);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [enabled, templateId, payload]);
}
