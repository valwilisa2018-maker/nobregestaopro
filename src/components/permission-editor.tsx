import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  MENU_MODULES,
  normalizePermissions,
  type PermissionAction,
  type PermissionMap,
} from "@/lib/access-control";

const labels: Record<PermissionAction, string> = {
  view: "Ver",
  create: "Criar",
  edit: "Editar",
  delete: "Excluir",
};

export function PermissionEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: PermissionMap;
  onChange: (value: PermissionMap) => void;
  disabled?: boolean;
}) {
  const normalized = normalizePermissions(value);
  const update = (moduleKey: string, action: PermissionAction, checked: boolean) => {
    const next = normalizePermissions(normalized);
    next[moduleKey][action] = checked;
    if (action !== "view" && checked) next[moduleKey].view = true;
    if (action === "view" && !checked)
      next[moduleKey] = { view: false, create: false, edit: false, delete: false };
    onChange(next);
  };
  const setAll = (checked: boolean) =>
    onChange(
      Object.fromEntries(
        MENU_MODULES.map((module) => [
          module.key,
          {
            view: checked && module.actions.includes("view"),
            create: checked && module.actions.includes("create"),
            edit: checked && module.actions.includes("edit"),
            delete: checked && module.actions.includes("delete"),
          },
        ]),
      ),
    );

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => setAll(true)}
        >
          Marcar tudo
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => setAll(false)}
        >
          Limpar
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="p-3 text-left font-medium">Módulo</th>
              {Object.values(labels).map((label) => (
                <th key={label} className="p-3 text-center font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MENU_MODULES.map((module) => (
              <tr key={module.key} className="border-t">
                <td className="p-3">
                  <div className="font-medium">{module.title}</div>
                  <div className="text-xs text-muted-foreground">{module.group}</div>
                </td>
                {(Object.keys(labels) as PermissionAction[]).map((action) => (
                  <td key={action} className="p-3 text-center">
                    <Checkbox
                      aria-label={`${labels[action]} ${module.title}`}
                      disabled={disabled || !module.actions.includes(action)}
                      checked={normalized[module.key][action]}
                      onCheckedChange={(checked) => update(module.key, action, checked === true)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
