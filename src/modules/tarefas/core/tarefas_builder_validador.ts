export function rebuildValidadorChecks(checks: any[], activeFieldIds: string[] = []) {
  const active = new Set((activeFieldIds || []).filter(Boolean));
  return (checks || []).filter(check => {
    if (!check) return false;
    if (!check.field_id) return true;
    return active.has(check.field_id);
  });
}
