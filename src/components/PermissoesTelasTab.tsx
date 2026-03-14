import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, CheckCheck } from "lucide-react";
import { ALL_SCREENS, groupScreens } from "@/lib/screen-permissions";

interface Props {
  profileId: string;
  isAdminProfile: boolean; // if the collaborator being edited is admin
}

export default function PermissoesTelasTab({ profileId, isAdminProfile }: Props) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const { data: permissoes, isLoading } = useQuery({
    queryKey: ["permissoes_tela", profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("permissoes_tela")
        .select("tela_path")
        .eq("profile_id", profileId);
      if (error) throw error;
      return data.map((p: any) => p.tela_path as string);
    },
  });

  useEffect(() => {
    if (permissoes) {
      setSelected(new Set(permissoes));
    }
  }, [permissoes]);

  const toggle = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleGroup = (paths: string[]) => {
    const allSelected = paths.every((p) => selected.has(p));
    setSelected((prev) => {
      const next = new Set(prev);
      paths.forEach((p) => {
        if (allSelected) next.delete(p);
        else next.add(p);
      });
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(ALL_SCREENS.map((s) => s.path)));
  };

  const deselectAll = () => {
    setSelected(new Set());
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await supabase.from("permissoes_tela").delete().eq("profile_id", profileId);
      if (selected.size > 0) {
        const rows = Array.from(selected).map((path) => ({
          profile_id: profileId,
          tela_path: path,
        }));
        const { error } = await supabase.from("permissoes_tela").insert(rows);
        if (error) throw error;
      }
      toast.success("Permissões salvas com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["permissoes_tela", profileId] });
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err?.message || "falha"));
    } finally {
      setSaving(false);
    }
  };

  if (isAdminProfile) {
    return (
      <div className="p-4 bg-success/5 border border-success/20 rounded-lg text-center">
        <CheckCheck className="w-6 h-6 text-success mx-auto mb-2" />
        <p className="text-body font-medium text-foreground">Administradores têm acesso total</p>
        <p className="text-caption text-muted-foreground mt-1">Não é necessário configurar permissões de tela para administradores.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const groups = groupScreens();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-body font-medium text-foreground">Telas visíveis para este colaborador</p>
          <p className="text-caption text-muted-foreground">
            {selected.size} de {ALL_SCREENS.length} tela(s) selecionada(s)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={selectAll}>Todas</Button>
          <Button variant="outline" size="sm" onClick={deselectAll}>Nenhuma</Button>
        </div>
      </div>

      <div className="space-y-3">
        {Object.entries(groups).map(([groupName, screens]) => {
          const allGroupSelected = screens.every((s) => selected.has(s.path));
          const someGroupSelected = screens.some((s) => selected.has(s.path));
          return (
            <div key={groupName} className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/50 border-b border-border">
                <Checkbox
                  checked={allGroupSelected}
                  // @ts-ignore
                  indeterminate={someGroupSelected && !allGroupSelected}
                  onCheckedChange={() => toggleGroup(screens.map((s) => s.path))}
                />
                <span className="text-body font-medium text-foreground">{groupName}</span>
                <Badge variant="secondary" className="text-caption ml-auto">
                  {screens.filter((s) => selected.has(s.path)).length}/{screens.length}
                </Badge>
              </div>
              <div className="divide-y divide-border">
                {screens.map((screen) => (
                  <label
                    key={screen.path}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 cursor-pointer transition-colors"
                  >
                    <Checkbox
                      checked={selected.has(screen.path)}
                      onCheckedChange={() => toggle(screen.path)}
                    />
                    <span className="text-body text-foreground">{screen.label}</span>
                    <span className="text-caption text-muted-foreground ml-auto font-mono">{screen.path}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving || !dirty} className="press-effect">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar Permissões
        </Button>
      </div>
    </div>
  );
}
