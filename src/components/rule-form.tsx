import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Project, ProjectRule, StoredEvent } from "../types/event";
import { parseCalendarEventData, parseGitEventData } from "../types/event";

interface RuleFormProps {
  project?: Project | null;
  rule?: ProjectRule | null;
  event?: StoredEvent | null;
  projects?: Project[];
  onSaved?: () => void;
  onCancel?: () => void;
  showActions?: boolean;
}

export function RuleForm({
  project,
  rule,
  event,
  projects = [],
  onSaved,
  onCancel,
  showActions = true,
}: RuleFormProps) {
  const [formData, setFormData] = useState({
    projectId: project?.id || (null as number | null),
    ruleType: "title_pattern" as "organizer" | "title_pattern" | "repository",
    matchValue: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (rule) {
      setFormData({
        projectId: rule.project_id,
        ruleType: rule.rule_type as
          | "organizer"
          | "title_pattern"
          | "repository",
        matchValue: rule.match_value,
      });
    } else if (event) {
      const eventData = parseCalendarEventData(event);
      const gitData = parseGitEventData(event);

      if (eventData?.organizer) {
        setFormData({
          projectId: project?.id || null,
          ruleType: "organizer",
          matchValue: eventData.organizer,
        });
      } else if (gitData?.repository_name) {
        setFormData({
          projectId: project?.id || null,
          ruleType: "repository",
          matchValue: gitData.repository_name,
        });
      } else {
        setFormData({
          projectId: project?.id || null,
          ruleType: "title_pattern",
          matchValue: event.title,
        });
      }
    } else {
      setFormData({
        projectId: project?.id || null,
        ruleType: "title_pattern",
        matchValue: "",
      });
    }
    setError(null);
  }, [rule, event, project]);

  async function handleSave() {
    if (!formData.projectId || !formData.matchValue.trim()) {
      setError("Please select a project and enter a match value");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (rule && rule.id) {
        await invoke("update_project_rule", {
          ruleId: rule.id,
          projectId: formData.projectId,
          ruleType: formData.ruleType,
          matchValue: formData.matchValue,
        });
      } else {
        await invoke("create_project_rule", {
          projectId: formData.projectId,
          ruleType: formData.ruleType,
          matchValue: formData.matchValue,
        });
      }
      onSaved?.();
    } catch (err) {
      setError(err as string);
      console.error("Error saving rule:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="project">Project</Label>
        <select
          id="project"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          value={formData.projectId || ""}
          onChange={(e) =>
            setFormData({
              ...formData,
              projectId: e.target.value ? Number(e.target.value) : null,
            })
          }
          disabled={saving}
        >
          <option value="">Select a project...</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="rule-type">Rule Type</Label>
        <select
          id="rule-type"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          value={formData.ruleType}
          onChange={(e) =>
            setFormData({
              ...formData,
              ruleType: e.target.value as
                | "organizer"
                | "title_pattern"
                | "repository",
            })
          }
          disabled={saving}
        >
          <option value="title_pattern">Title contains text</option>
          <option value="organizer">Organizer email</option>
          <option value="repository">Git repository</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="match-value">
          {formData.ruleType === "organizer" && "Organizer Email"}
          {formData.ruleType === "title_pattern" && "Text to Match"}
          {formData.ruleType === "repository" && "Repository Name"}
        </Label>
        <Input
          id="match-value"
          placeholder={
            formData.ruleType === "organizer"
              ? "user@example.com"
              : formData.ruleType === "title_pattern"
                ? "standup"
                : "my-repo"
          }
          value={formData.matchValue}
          onChange={(e) =>
            setFormData({
              ...formData,
              matchValue: e.target.value,
            })
          }
          disabled={saving}
        />
      </div>
      {error && <div className="text-sm text-destructive">{error}</div>}
      {showActions && (
        <div className="flex justify-end gap-2 pt-2">
          {onCancel && (
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={saving}
              type="button"
            >
              Cancel
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving} type="button">
            {saving ? "Saving..." : rule ? "Save Changes" : "Add Rule"}
          </Button>
        </div>
      )}
    </div>
  );
}
